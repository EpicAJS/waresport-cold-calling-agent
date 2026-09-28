import { eq } from "drizzle-orm";
import { db, orgSettings } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function getOrgSettings() {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.id, 1)).limit(1);
  return {
    companyName: row?.companyName || "Waresport",
    fromEmail: row?.fromEmail || process.env.EMAIL_FROM || "",
    resendApiKey: decrypt(row?.resendApiKeyEnc) || process.env.RESEND_API_KEY || "",
    resendKeySource: row?.resendApiKeyEnc ? "settings" : process.env.RESEND_API_KEY ? "env" : "none",
    mailingAddress: row?.mailingAddress || "",
  };
}

export type OrgSettings = Awaited<ReturnType<typeof getOrgSettings>>;
