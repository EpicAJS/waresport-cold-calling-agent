import { sign } from "@/lib/crypto";
import { appUrl, isPublicUrl } from "@/lib/env";

export function trackingEnabled() {
  return isPublicUrl(appUrl());
}

export function clickSignature(emailId: string, url: string) {
  return sign(`${emailId}|${url}`);
}

/** Adds an open pixel and routes links through the click tracker (unsubscribe links are left alone). */
export function addTracking(html: string, emailId: string) {
  const base = appUrl();
  const withClicks = html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
    if (url.includes("/unsubscribe") || url.includes("/api/unsubscribe")) return match;
    const decoded = url.replace(/&amp;/g, "&");
    return `href="${base}/api/t/c/${emailId}?u=${encodeURIComponent(decoded)}&amp;s=${clickSignature(emailId, decoded)}"`;
  });
  const pixel = `<img src="${base}/api/t/o/${emailId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  return withClicks.includes("</div>") ? withClicks.replace(/<\/div>\s*$/, `${pixel}</div>`) : withClicks + pixel;
}
