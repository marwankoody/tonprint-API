import mongoose from 'mongoose'
import { Design } from './design.model.js'
import { Product } from '../products/product.model.js'
import { AppError } from '../../utils/AppError.js'
import { parsePagination, paginationMeta } from '../../utils/pagination.js'
import {
  uploadDesignImage,
  uploadDesignPreview,
  uploadDesignPrintFile,
  deleteCloudinaryImages,
} from '../../lib/cloudinaryUpload.js'

/**
 * Formate un design pour la réponse API.
 * Les fichiers d'impression (`printFileUrl`) ne sont exposés qu'en contexte admin :
 * le créateur télécharge son export localement depuis l'éditeur.
 *
 * @param {object} design
 * @param {{ includeCanvas?: boolean, includePrintFiles?: boolean }} [options]
 */
function formatDesign(design, options = {}) {
  const { includeCanvas = false, includePrintFiles = false } = options

  const productId =
    design.product && typeof design.product === 'object' && design.product._id
      ? undefined
      : (design.product?.toString?.() ?? design.product ?? null)

  const product =
    design.product && typeof design.product === 'object' && design.product._id
      ? {
          id: design.product._id.toString(),
          name: design.product.name,
          category: design.product.category,
          price: design.product.price,
        }
      : productId

  return {
    id: design._id.toString(),
    creator: design.creator?.toString?.() ?? design.creator,
    product,
    title: design.title,
    variant: design.variant || {},
    zones: (design.zones || []).map((z) => ({
      zone: z.zone,
      previewUrl: z.previewUrl || '',
      ...(includeCanvas ? { canvasJson: z.canvasJson } : {}),
      ...(includePrintFiles ? { printFileUrl: z.printFileUrl || '' } : {}),
    })),
    status: design.status,
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
  }
}

/** Collecte tous les publicIds Cloudinary (previews + fichiers d'impression) d'un design. */
function collectAssetPublicIds(design) {
  const ids = []
  for (const zone of design.zones || []) {
    if (zone.previewPublicId) ids.push(zone.previewPublicId)
    if (zone.printFilePublicId) ids.push(zone.printFilePublicId)
  }
  return ids
}

/**
 * Vérifie que le produit est personnalisable et que les zones demandées
 * correspondent à ses `printAreas` configurées.
 * @param {string} productId
 * @param {{ zone: string }[]} zones
 */
async function assertProductAllowsZones(productId, zones) {
  const product = await Product.findById(productId)
    .select('channel isPublished printAreas.zone')
    .lean()

  if (!product || !product.isPublished || product.channel !== 'personalization') {
    throw new AppError('Product not available for personalization', 404, 'PRODUCT_NOT_FOUND')
  }

  const allowedZones = new Set((product.printAreas || []).map((area) => area.zone))
  for (const { zone } of zones) {
    if (!allowedZones.has(zone)) {
      throw new AppError(
        `Zone "${zone}" is not printable on this product`,
        400,
        'INVALID_ZONE'
      )
    }
  }
}

/**
 * Charge un design et vérifie qu'il appartient bien à l'utilisateur.
 * @param {string} designId
 * @param {string} userId
 */
async function findOwnedDesign(designId, userId) {
  if (!mongoose.isValidObjectId(designId)) {
    throw new AppError('Invalid design id', 400, 'INVALID_ID')
  }

  const design = await Design.findById(designId)
  if (!design) {
    throw new AppError('Design not found', 404, 'DESIGN_NOT_FOUND')
  }

  if (design.creator.toString() !== userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN')
  }

  return design
}

/**
 * @param {string} userId
 * @param {{ product: string, title: string, variant?: object, zones: object[] }} payload
 */
export async function createDesign(userId, payload) {
  await assertProductAllowsZones(payload.product, payload.zones)

  const design = await Design.create({
    creator: userId,
    product: payload.product,
    title: payload.title,
    variant: payload.variant || {},
    zones: payload.zones.map((z) => ({ zone: z.zone, canvasJson: z.canvasJson })),
    status: 'draft',
  })

  return formatDesign(design, { includeCanvas: true })
}

/**
 * Met à jour titre, variante et/ou zones d'un design (ownership requis).
 * Les zones remplacées conservent leurs assets existants (preview/print) —
 * ils seront regénérés à l'export ; les zones supprimées voient leurs assets nettoyés.
 *
 * @param {string} designId
 * @param {string} userId
 * @param {{ title?: string, variant?: object, zones?: object[] }} payload
 */
export async function updateDesign(designId, userId, payload) {
  const design = await findOwnedDesign(designId, userId)

  if (payload.title !== undefined) design.title = payload.title
  if (payload.variant !== undefined) design.variant = payload.variant

  if (payload.zones !== undefined) {
    await assertProductAllowsZones(design.product.toString(), payload.zones)

    const previousZones = new Map(design.zones.map((z) => [z.zone, z]))
    const removedZoneAssets = []

    const nextZones = payload.zones.map((z) => {
      const previous = previousZones.get(z.zone)
      previousZones.delete(z.zone)
      return {
        zone: z.zone,
        canvasJson: z.canvasJson,
        previewUrl: previous?.previewUrl || '',
        previewPublicId: previous?.previewPublicId || '',
        printFileUrl: previous?.printFileUrl || '',
        printFilePublicId: previous?.printFilePublicId || '',
      }
    })

    for (const removed of previousZones.values()) {
      if (removed.previewPublicId) removedZoneAssets.push(removed.previewPublicId)
      if (removed.printFilePublicId) removedZoneAssets.push(removed.printFilePublicId)
    }

    design.zones = nextZones
    await design.save()

    if (removedZoneAssets.length) {
      deleteCloudinaryImages(removedZoneAssets).catch(() => {
        // Nettoyage best-effort : un échec ne doit pas faire échouer la mise à jour.
      })
    }
  } else {
    await design.save()
  }

  return formatDesign(design, { includeCanvas: true })
}

/**
 * Liste paginée des designs de l'utilisateur — projection légère
 * (sans `canvasJson` ni fichiers d'impression).
 * @param {string} userId
 * @param {{ page?: number, limit?: number }} query
 */
export async function listMyDesigns(userId, query) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 24, defaultLimit: 12 })
  const filter = { creator: userId }

  const [items, total] = await Promise.all([
    Design.find(filter)
      .select('-zones.canvasJson -zones.printFileUrl -zones.printFilePublicId')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('product', 'name category price')
      .lean(),
    Design.countDocuments(filter),
  ])

  return {
    designs: items.map((d) => formatDesign(d)),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Détail complet d'un design (avec `canvasJson` pour réédition).
 * @param {string} designId
 * @param {string} userId
 */
export async function getMyDesignById(designId, userId) {
  const design = await findOwnedDesign(designId, userId)
  return formatDesign(design, { includeCanvas: true })
}

/**
 * Supprime un design et nettoie ses assets Cloudinary (previews + fichiers d'impression).
 * Les images importées (`designs/uploads`) sont conservées : elles peuvent être
 * référencées par d'autres designs du créateur.
 *
 * @param {string} designId
 * @param {string} userId
 */
export async function deleteDesign(designId, userId) {
  const design = await findOwnedDesign(designId, userId)
  const publicIds = collectAssetPublicIds(design)

  await design.deleteOne()

  if (publicIds.length) {
    deleteCloudinaryImages(publicIds).catch(() => {
      // Nettoyage best-effort.
    })
  }
}

/**
 * Upload une image importée dans l'éditeur (rangée par utilisateur sur Cloudinary).
 * @param {string} userId
 * @param {{ buffer: Buffer, originalname?: string }} file
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export async function uploadCreatorImage(userId, file) {
  if (!file?.buffer) {
    throw new AppError('Image file is required (field "image")', 400, 'FILE_REQUIRED')
  }
  return uploadDesignImage(file.buffer, userId, file.originalname)
}

/**
 * Enregistre les exports générés par l'éditeur pour une zone :
 * preview (mockup web) + fichier d'impression (PNG isolé transparent).
 * Les anciens assets de la zone sont supprimés de Cloudinary.
 *
 * @param {string} designId
 * @param {string} userId
 * @param {string} zone
 * @param {{ preview?: { buffer: Buffer }[], printFile?: { buffer: Buffer, mimetype: string }[] }} files
 */
export async function saveZoneAssets(designId, userId, zone, files) {
  const design = await findOwnedDesign(designId, userId)

  const zoneEntry = design.zones.find((z) => z.zone === zone)
  if (!zoneEntry) {
    throw new AppError(`Zone "${zone}" not found on this design`, 400, 'INVALID_ZONE')
  }

  const previewFile = files?.preview?.[0]
  const printFile = files?.printFile?.[0]
  if (!previewFile && !printFile) {
    throw new AppError('At least one file is required (preview or printFile)', 400, 'FILE_REQUIRED')
  }
  if (printFile && printFile.mimetype !== 'image/png') {
    throw new AppError('Print file must be a transparent PNG', 400, 'INVALID_PRINT_FILE')
  }

  const obsoleteIds = []

  if (previewFile) {
    const uploaded = await uploadDesignPreview(previewFile.buffer, `${designId}-${zone}-preview`)
    if (zoneEntry.previewPublicId) obsoleteIds.push(zoneEntry.previewPublicId)
    zoneEntry.previewUrl = uploaded.url
    zoneEntry.previewPublicId = uploaded.publicId
  }

  if (printFile) {
    const uploaded = await uploadDesignPrintFile(printFile.buffer, `${designId}-${zone}-print`)
    if (zoneEntry.printFilePublicId) obsoleteIds.push(zoneEntry.printFilePublicId)
    zoneEntry.printFileUrl = uploaded.url
    zoneEntry.printFilePublicId = uploaded.publicId
  }

  await design.save()

  if (obsoleteIds.length) {
    deleteCloudinaryImages(obsoleteIds).catch(() => {
      // Nettoyage best-effort.
    })
  }

  return formatDesign(design)
}
