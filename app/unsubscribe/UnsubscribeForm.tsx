'use client';

import { useState } from "react";
import { unsubscribeWithToken } from "@/lib/actions/email.actions";

type Status = 'idle' | 'working' | 'done' | 'error';

const UnsubscribeForm = ({ token }: { token: string }) => {
    const [status, setStatus] = useState<Status>('idle');

    const unsubscribe = async () => {
        setStatus('working');
        const { success } = await unsubscribeWithToken(token).catch(() => ({ success: false }));
        setStatus(success ? 'done' : 'error');
    };

    if(status === 'done') {
        return <p aria-live="polite">You will no longer get lesson summary emails. You can turn them back on in My Journey.</p>;
    }

    return (
        <div className="flex flex-col gap-4 items-start">
            <p>Stop getting an email with your lesson summary after each lesson?</p>
            <button className="btn-primary" onClick={unsubscribe} disabled={status === 'working'}>
                {status === 'working' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
            {status === 'error' && (
                <p className="text-red-700" aria-live="polite">This unsubscribe link is not valid. You can turn emails off in My Journey instead.</p>
            )}
        </div>
    );
};

export default UnsubscribeForm;
