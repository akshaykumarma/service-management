import nodemailer from "nodemailer";

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? "587"),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "no-reply@example.com",
    to,
    subject: "Reset your Service Management password",
    text: `Reset your password by visiting this link (valid for 30 minutes): ${resetUrl}`,
    html: `<p>Reset your password by clicking the link below (valid for 30 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}
