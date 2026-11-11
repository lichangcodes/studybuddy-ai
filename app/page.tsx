import CompanionCard from "@/components/CompanionCard";
import CompanionsList from "@/components/CompanionsList";
import CTA from "@/components/CTA";
import {getAllCompanions, getBookmarkedCompanionIds, getRecentSessions} from "@/lib/actions/companion.actions";
import {getSubjectColor} from "@/lib/utils";

// The page shows per-user bookmarks, so it can't be prerendered. Supabase reads the
// Clerk token inside its fetch and swallows Next's dynamic-usage signal, which makes
// `next build` fail instead of falling back to dynamic rendering, so opt in explicitly.
export const dynamic = 'force-dynamic';

const Page = async () => {
    const companions = await getAllCompanions({ limit: 3 });
    const recentSessionsCompanions = await getRecentSessions(10);
    const bookmarkedIds = await getBookmarkedCompanionIds();

  return (
    <main>
      <h1>Popular Companions</h1>

        <section className="home-section">
            {companions.map((companion) => (
                <CompanionCard
                    key={companion.id}
                    {...companion}
                    color={getSubjectColor(companion.subject)}
                    bookmarked={bookmarkedIds.includes(companion.id)}
                />
            ))}

        </section>

        <section className="home-section">
            <CompanionsList
                title="Recently completed sessions"
                companions={recentSessionsCompanions}
                classNames="w-2/3 max-lg:w-full"
            />
            <CTA />
        </section>
    </main>
  )
}

export default Page