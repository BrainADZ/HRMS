import nodemailer from 'nodemailer';

export function createPasswordResetMailer(env = process.env) {
  const appUrl = env.PUBLIC_APP_URL || env.CLIENT_ORIGIN;
  if (!appUrl || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM) return null;
  const url = new URL(appUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('PUBLIC_APP_URL must be an HTTP(S) application URL');
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT');
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure,
    requireTLS: !secure,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    appUrl: url.origin,
    async send({ to, resetUrl }) {
      const result = await transport.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: 'Reset your BrainADZ HRMS admin password',
        text: `Reset your administrator password using this link:\n\n${resetUrl}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email.`,
      });
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error('Reset email was not accepted');
    },
  };
}
