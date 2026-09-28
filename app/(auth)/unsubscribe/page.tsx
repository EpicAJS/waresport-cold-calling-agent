import { verifySignature } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default function UnsubscribePage({ searchParams }: { searchParams: { c?: string; s?: string; done?: string } }) {
  const c = searchParams.c ?? "";
  const s = searchParams.s ?? "";
  const valid = /^[0-9a-f-]{36}$/i.test(c) && verifySignature(c, s);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-xl border border-gray-200 p-6 text-center space-y-4">
        {!valid ? (
          <>
            <h1 className="text-lg font-bold text-gray-900">Link not valid</h1>
            <p className="text-sm text-gray-500">This unsubscribe link is invalid. Reply to the email and ask to be removed.</p>
          </>
        ) : searchParams.done ? (
          <>
            <h1 className="text-lg font-bold text-gray-900">You&apos;re unsubscribed</h1>
            <p className="text-sm text-gray-500">You won&apos;t receive any more emails from us.</p>
          </>
        ) : (
          <form method="post" action={`/api/unsubscribe?c=${c}&s=${s}`} className="space-y-4">
            <h1 className="text-lg font-bold text-gray-900">Unsubscribe?</h1>
            <p className="text-sm text-gray-500">Click below to stop receiving emails from us.</p>
            <input type="hidden" name="confirm" value="1" />
            <button type="submit" className="w-full px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900">
              Unsubscribe
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
