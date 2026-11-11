import UnsubscribeForm from "@/app/unsubscribe/UnsubscribeForm";

// Opened from the link in lesson summary emails, possibly signed out. Unsubscribing
// takes a button press, so link scanners that open the page change nothing.
const UnsubscribePage = async ({ searchParams }: { searchParams: Promise<{ token?: string }> }) => {
    const { token } = await searchParams;

    return (
        <main className="items-center">
            <section className="rounded-border p-8 flex flex-col gap-4 max-w-lg w-full">
                <h1 className="text-2xl font-bold">Lesson summary emails</h1>
                {token
                    ? <UnsubscribeForm token={token} />
                    : <p>This link is missing its unsubscribe code. You can turn emails off in My Journey instead.</p>}
            </section>
        </main>
    );
};

export default UnsubscribePage;
