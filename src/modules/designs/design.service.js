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

  const populated =
    design.product && typeof design.product === 'object' && design.product._id
      ? {
          id: design.product._id.toString(),
          name: design.product.name,
          category: design.product.category,
          subcategory: design.product.subcategory,
          price: design.product.price,
        }
      : null

  const productId =
    !populated && design.product
      ? (design.product?.toString?.() ?? design.product)
      : null

  const snapshotName = design.productSnapshot?.name || ''

  return {
    id: design._id.toString(),
    creator: design.creator?.toString?.() ?? design.creator,
    product: populated || productId,
    productSnapshot: snapshotName ? { name: snapshotName } : null,
    title: design.title,
    variant: design.variant || {},
    zones: (design.zones || []).map((z) => ({
      zone: z.zone,
      previewUrl: z.previewUrl || '',
      ...(includeCanvas ? { canvasJson: z.canvasJson } : {}),
      ...(includePrintFiles ? { printFileUrl: z.printFileUrl || '' } : {}),
    })),
    status: design.status,
    licenseGrantedByCreator: Boolean(design.licenseGrantedByCreator),
    rejectionReason: design.rejectionReason || '',
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
 * Vérifie que le design est encore lié à un produit catalogue.
 * @param {object} design
 */
function assertDesignHasProduct(design) {
  const productId = design.product?._id?.toString?.() ?? design.product?.toString?.() ?? design.product
  if (!productId) {
    throw new AppError(
      'This design is no longer linked to a catalog product',
      409,
      'PRODUCT_DELETED'
    )
  }
  return productId
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
 * @param {{ lean?: boolean, select?: string }} [options]
 *   `lean: true` pour lectures seules (pas de save/delete) ;
 *   `select` pour ne pas charger le canvasJson quand il est inutile.
 */
async function findOwnedDesign(designId, userId, options = {}) {
  if (!mongoose.isValidObjectId(designId)) {
    throw new AppError('Invalid design id', 400, 'INVALID_ID')
  }

  let queryBuilder = Design.findById(designId)
  if (options.select) queryBuilder = queryBuilder.select(options.select)
  const design = options.lean ? await queryBuilder.lean() : await queryBuilder
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
    const productId = assertDesignHasProduct(design)
    await assertProductAllowsZones(productId, payload.zones)

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
      .populate('product', 'name category subcategory price')
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
  if (!mongoose.isValidObjectId(designId)) {
    throw new AppError('Invalid design id', 400, 'INVALID_ID')
  }

  const design = await Design.findById(designId)
    .populate('product', 'name category subcategory price')
    .lean()

  if (!design) {
    throw new AppError('Design not found', 404, 'DESIGN_NOT_FOUND')
  }
  if (design.creator.toString() !== userId) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN')
  }

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
  const design = await findOwnedDesign(designId, userId, { select: '-zones.canvasJson' })
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
  assertDesignHasProduct(design)

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

/**
 * Soumet un design à la revue TonPrint (revente marketplace / réseaux).
 * Prérequis : au moins une zone avec preview + print file.
 * @param {string} designId
 * @param {string} userId
 */
export async function submitDesign(designId, userId) {
  const design = await findOwnedDesign(designId, userId, { select: '-zones.canvasJson' })
  assertDesignHasProduct(design)

  if (design.status === 'pending_review') {
    return formatDesign(design)
  }
  if (design.status === 'approved') {
    throw new AppError('Design is already approved', 400, 'ALREADY_APPROVED')
  }

  const ready = (design.zones || []).some((z) => z.previewUrl && z.printFileUrl)
  if (!ready) {
    throw new AppError(
      'Save the design with print exports before submitting',
      400,
      'ASSETS_REQUIRED'
    )
  }

  design.status = 'pending_review'
  design.licenseGrantedByCreator = true
  design.rejectionReason = ''
  await design.save()
  return formatDesign(design)
}

/**
 * Retire un design de la file de revue (revient en brouillon).
 * Impossible si déjà approuvé (produits marketplace éventuellement liés).
 * @param {string} designId
 * @param {string} userId
 */
export async function withdrawDesign(designId, userId) {
  const design = await findOwnedDesign(designId, userId, { select: '-zones.canvasJson' })

  if (design.status === 'approved') {
    throw new AppError('Cannot withdraw an approved design', 400, 'CANNOT_WITHDRAW')
  }
  if (design.status === 'draft') {
    return formatDesign(design)
  }

  design.status = 'draft'
  design.licenseGrantedByCreator = false
  design.rejectionReason = ''
  await design.save()
  return formatDesign(design)
}

/**
 * Formate un design pour l'admin (créateur peuplé + fichiers d'impression).
 * @param {object} design — lean, creator/product éventuellement peuplés
 */
function formatAdminDesign(design) {
  const formatted = formatDesign(design, { includePrintFiles: true })
  return {
    ...formatted,
    creator:
      design.creator && typeof design.creator === 'object' && design.creator._id
        ? {
            id: design.creator._id.toString(),
            name: design.creator.name || '',
            email: design.creator.email || '',
            phone: design.creator.phone || '',
          }
        : formatted.creator,
  }
}

/**
 * Détail admin d'un design (demande de publication) : client, produit, zones,
 * mockups + PNG d'impression. Sans `canvasJson` (trop lourd / inutile en revue).
 * @param {string} designId
 */
export async function getAdminDesignById(designId) {
  if (!mongoose.isValidObjectId(designId)) {
    throw new AppError('Invalid design id', 400, 'INVALID_ID')
  }

  const design = await Design.findById(designId)
    .select('-zones.canvasJson')
    .populate('product', 'name category subcategory price channel')
    .populate('creator', 'name email phone')
    .lean()

  if (!design) {
    throw new AppError('Design not found', 404, 'DESIGN_NOT_FOUND')
  }

  return formatAdminDesign(design)
}

/**
 * Liste admin des designs en attente (ou filtrés par statut).
 * @param {{ page?: number, limit?: number, status?: string }} query
 */
export async function listAdminDesigns(query = {}) {
  const { page, limit, skip } = parsePagination(query, { maxLimit: 40, defaultLimit: 20 })
  const status = query.status || 'pending_review'
  const filter = status === 'all' ? {} : { status }

  const [items, total] = await Promise.all([
    Design.find(filter)
      .select('-zones.canvasJson -zones.printFileUrl -zones.printFilePublicId')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('product', 'name category subcategory')
      .populate('creator', 'name email')
      .lean(),
    Design.countDocuments(filter),
  ])

  return {
    designs: items.map((d) => ({
      ...formatDesign(d),
      creator:
        d.creator && typeof d.creator === 'object' && d.creator._id
          ? {
              id: d.creator._id.toString(),
              name: d.creator.name || '',
              email: d.creator.email || '',
            }
          : d.creator?.toString?.() ?? d.creator,
    })),
    pagination: paginationMeta({ page, limit, total }),
  }
}

/**
 * Approuve un design (admin). N'auto-publie pas de produit — l'admin le crée ensuite.
 * @param {string} designId
 */
export async function approveDesign(designId) {
  if (!mongoose.isValidObjectId(designId)) {
    throw new AppError('Invalid design id', 400, 'INVALID_ID')
  }
  // Update conditionnelle (statut vérifié dans le filtre) — ne charge jamais le canvasJson.
  const design = await Design.findOneAndUpdate(
    { _id: designId, status: { $in: ['pending_review', 'rejected'] } },
    { $set: { status: 'approved', licenseGrantedByCreator: true, rejectionReason: '' } },
    { new: true, projection: { 'zones.canvasJson': 0 } }
  ).lean()

  if (!design) {
    const exists = await Design.exists({ _id: designId })
    if (!exists) throw new AppError('Design not found', 404, 'DESIGN_NOT_FOUND')
    throw new AppError('Design is not awaiting review', 400, 'INVALID_STATUS')
  }

  return formatDesign(design, { includePrintFiles: true })
}

/**
 * Rejette un design avec motif (admin).
 * @param {string} designId
 * @param {string} reason
 */
export async function rejectDesign(designId, reason) {
  if (!mongoose.isValidObjectId(designId)) {
    throw new AppError('Invalid design id', 400, 'INVALID_ID')
  }
  const design = await Design.findOneAndUpdate(
    { _id: designId, status: 'pending_review' },
    { $set: { status: 'rejected', rejectionReason: (reason || '').trim().slice(0, 500) } },
    { new: true, projection: { 'zones.canvasJson': 0 } }
  ).lean()

  if (!design) {
    const exists = await Design.exists({ _id: designId })
    if (!exists) throw new AppError('Design not found', 404, 'DESIGN_NOT_FOUND')
    throw new AppError('Design is not awaiting review', 400, 'INVALID_STATUS')
  }

  return formatDesign(design, { includePrintFiles: true })
}
