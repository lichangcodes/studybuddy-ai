import { EventEmitter } from "events";

type MockOverrides = { variableValues?: { topic?: string } };
export type ScriptLine = { role: 'assistant' | 'user'; text: string };

const PAUSE_MS = 700;
// Roughly reading speed, so longer lines stay on screen long enough to follow.
const speakMs = (text: string) => Math.min(7000, Math.max(1500, text.length * 45));

// Stand-in for the Vapi client that replays a scripted lesson locally,
// so the session UI and session history can be tested without spending call credits.
export class MockVapi extends EventEmitter {
    private timers: ReturnType<typeof setTimeout>[] = [];
    private active = false;
    private muted = false;
    private nextScript: ScriptLine[] | null = null;

    // A lesson for the next start() only (generated on the server in demo mode);
    // without one, start() plays the short built-in script.
    setScript(script: ScriptLine[] | null) {
        this.nextScript = script;
    }

    async start(_assistant?: unknown, overrides?: MockOverrides) {
        const topic = overrides?.variableValues?.topic ?? 'today\'s topic';
        const script: ScriptLine[] = this.nextScript ?? [
            { role: 'assistant', text: `Hello, let's start the session. Today we'll be talking about ${topic}.` },
            { role: 'user', text: 'Sounds good, where should we begin?' },
            { role: 'assistant', text: `Let's start with the core idea behind ${topic}, then work through an example.` },
            { role: 'user', text: 'Okay, I think I follow so far.' },
            { role: 'assistant', text: 'Great. Try explaining it back to me in your own words.' },
        ];
        this.nextScript = null;

        this.active = true;
        let t = 800;
        this.schedule(t, () => this.emit('call-start'));

        for(const line of script) {
            t += PAUSE_MS;
            if(line.role === 'assistant') this.schedule(t, () => this.emit('speech-start'));
            t += speakMs(line.text);
            this.schedule(t, () => {
                if(line.role === 'assistant') this.emit('speech-end');
                this.emit('message', { type: 'transcript', transcriptType: 'final', role: line.role, transcript: line.text });
            });
        }

        // Stands in for the Call object the real client resolves with.
        return {};
    }

    stop() {
        if(!this.active) return;
        this.active = false;
        this.timers.forEach(clearTimeout);
        this.timers = [];
        // The real client emits call-end on stop, and the session UI relies on it.
        this.emit('call-end');
    }

    isMuted() {
        return this.muted;
    }

    setMuted(mute: boolean) {
        this.muted = mute;
    }

    private schedule(ms: number, fn: () => void) {
        this.timers.push(setTimeout(fn, ms));
    }
}
