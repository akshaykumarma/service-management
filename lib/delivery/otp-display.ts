import { NextResponse } from "next/server";

/**
 * TEMPORARY — testing aid requested by the product owner: while SHOW_OTP_ON_SCREEN=true,
 * the delivery routes also return the one-time code so staff can see it on the ticket
 * page (the WhatsApp send still happens as normal). It defeats the point of the OTP
 * (proving the customer has their phone), so it MUST be switched off and removed — after
 * confirming with the owner — before a production deployment. See CLAUDE.md.
 */
export function isOtpOnScreenEnabled(): boolean {
  return process.env.SHOW_OTP_ON_SCREEN === "true";
}

/** The 202 every OTP-issuing route returns, carrying the code only in on-screen test mode. */
export function otpIssuedResponse(code: string): NextResponse {
  if (!isOtpOnScreenEnabled()) return new NextResponse(null, { status: 202 });
  return NextResponse.json({ testOtp: code }, { status: 202 });
}
