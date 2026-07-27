/**
 * Templates email transactionnels (FR).
 */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{ name: string, resetUrl: string }} opts
 */
export function passwordResetEmail({ name, resetUrl }) {
  const displayName = name || 'Bonjour'
  const safeName = escapeHtml(displayName)
  const safeUrl = escapeHtml(resetUrl)
  const subject = 'Réinitialisation de votre mot de passe TonPrint'
  const text = [
    `${displayName},`,
    '',
    'Vous avez demandé à réinitialiser votre mot de passe TonPrint.',
    'Ouvrez le lien ci-dessous (valable 1 heure) :',
    resetUrl,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    '',
    '— L’équipe TonPrint',
  ].join('\n')

  const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f97316;">TonPrint</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#18181b;">Réinitialiser votre mot de passe</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeName},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">
                Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous.
                Ce lien expire dans <strong>1 heure</strong>.
              </p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="${safeUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px;">
                  Choisir un nouveau mot de passe
                </a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
              </p>
              <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#52525b;">${safeUrl}</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">
                Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim()

  return { subject, text, html }
}
