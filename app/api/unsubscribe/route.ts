import { unsubscribeWithToken } from "@/lib/actions/email.actions";

// One-click unsubscribe (RFC 8058): mail clients POST to the List-Unsubscribe URL
// without opening a page. A GET would be unsafe here, because link scanners
// prefetch URLs in emails, so people clicking the link get the /unsubscribe page.
export async function POST(request: Request) {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const { success } = await unsubscribeWithToken(token);
    return new Response(null, { status: success ? 200 : 400 });
}
