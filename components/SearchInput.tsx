'use client';

import {useRouter, useSearchParams} from "next/navigation";
import {useEffect, useRef, useState} from "react";
import Image from "next/image";
import {removeQueryParams, setQueryParam} from "@/lib/url";

const SearchInput = () => {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Start from the URL so the box matches the results after a refresh.
    const [searchQuery, setSearchQuery] = useState(searchParams.get('topic') || '');
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    const handleChange = (value: string) => {
        setSearchQuery(value);

        // Debounce: only update the URL once typing pauses for 500ms.
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            // Read the params at fire time so changes made meanwhile (e.g. the subject filter) are kept.
            const params = window.location.search;
            const newUrl = value
                ? setQueryParam(params, "topic", value)
                : removeQueryParams(params, ["topic"]);

            router.push(newUrl, { scroll: false });
        }, 500);
    }

    return (
        <div className="relative border border-black rounded-lg items-center flex gap-2 px-2 py-1 h-fit">
            <Image src="/icons/search.svg" alt="search" width={15} height={15} />
            <input
                placeholder="Search companions..."
                className="outline-none"
                value={searchQuery}
                onChange={(e) => handleChange(e.target.value)}
            />
        </div>
    )
}
export default SearchInput
