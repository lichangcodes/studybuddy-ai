import type { SessionSummary } from "@/lib/summary";

export type SummaryState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; summary: SessionSummary }
    | { status: 'unavailable'; reason: string };

const Section = ({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) => {
    if(items.length === 0) return null;
    const List = ordered ? 'ol' : 'ul';
    return (
        <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg">{title}</h3>
            <List className={`${ordered ? 'list-decimal' : 'list-disc'} pl-6 flex flex-col gap-1`}>
                {items.map((item, i) => <li key={i}>{item}</li>)}
            </List>
        </div>
    );
};

const SessionSummaryCard = ({ state }: { state: SummaryState }) => {
    if(state.status === 'idle') return null;

    return (
        <section className="rounded-border p-6 mt-8 flex flex-col gap-4" aria-live="polite">
            <h2 className="text-2xl font-bold">Lesson summary</h2>

            {state.status === 'loading' && (
                <p className="text-muted-foreground animate-pulse">Writing your summary…</p>
            )}

            {state.status === 'unavailable' && (
                <p className="text-muted-foreground">{state.reason}</p>
            )}

            {state.status === 'ready' && (
                <>
                    <p>{state.summary.overview}</p>
                    <Section title="Key points" items={state.summary.key_points} />
                    <Section title="Check yourself" items={state.summary.review_questions} ordered />
                    <Section title="Next steps" items={state.summary.next_steps} />
                </>
            )}
        </section>
    );
};

export default SessionSummaryCard;
