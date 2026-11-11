'use client';

import { useState } from "react";
import { setSummaryEmails } from "@/lib/actions/email.actions";

const SummaryEmailToggle = ({ initialEnabled }: { initialEnabled: boolean }) => {
    const [enabled, setEnabled] = useState(initialEnabled);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(false);

    const toggle = async () => {
        const next = !enabled;
        setEnabled(next);
        setSaving(true);
        setError(false);
        const { success } = await setSummaryEmails(next).catch(() => ({ success: false }));
        if(!success) {
            setEnabled(!next);
            setError(true);
        }
        setSaving(false);
    };

    return (
        <div className="flex flex-col gap-1">
            <label className="flex items-center gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    className="size-5 accent-primary cursor-pointer"
                    checked={enabled}
                    onChange={toggle}
                    disabled={saving}
                />
                <span>Email me a summary after each lesson</span>
            </label>
            {error && <p className="text-sm text-red-700" aria-live="polite">Could not save that. Please try again.</p>}
        </div>
    );
};

export default SummaryEmailToggle;
