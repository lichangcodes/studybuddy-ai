"use client";
import React, { useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { subjects } from "@/constants";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { removeQueryParams, setQueryParam } from "@/lib/url";

const SubjectFilter = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const query = searchParams.get("subject") || "";

    const [subject, setSubject] = useState(query);

    // Update the URL when the user picks a subject, not on mount.
    const handleChange = (value: string) => {
        setSubject(value);
        const newUrl = value === "all"
            ? removeQueryParams(searchParams.toString(), ["subject"])
            : setQueryParam(searchParams.toString(), "subject", value);
        router.push(newUrl, { scroll: false });
    };

    return (
        <Select onValueChange={handleChange} value={subject}>
            <SelectTrigger className="input capitalize">
                <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map((subject) => (
                    <SelectItem key={subject} value={subject} className="capitalize">
                        {subject}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

export default SubjectFilter;