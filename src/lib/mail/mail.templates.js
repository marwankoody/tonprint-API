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
 * Email OTP réinitialisation mot de passe.
 * @param {{ name: string, code: string }} opts
 */
export function passwordResetOtpEmail({ name, code }) {
  const displayName = name || 'Bonjour'
  const safeName = escapeHtml(displayName)
  const safeCode = escapeHtml(code)
  const subject = 'Votre code de réinitialisation TonPrint'

  const text = [
    `${displayName},`,
    '',
    'Vous avez demandé à réinitialiser votre mot de passe TonPrint.',
    `Votre code est : ${code}`,
    'Il expire dans 10 minutes.',
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
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#18181b;">Code de réinitialisation</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${safeName},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">
                Saisissez ce code sur TonPrint pour choisir un nouveau mot de passe.
                Il expire dans <strong>10 minutes</strong>.
              </p>
              <p style="margin:0 0 24px;text-align:center;font-size:32px;font-weight:700;letter-spacing:0.35em;color:#18181b;font-family:ui-monospace,monospace;">
                ${safeCode}
              </p>
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
