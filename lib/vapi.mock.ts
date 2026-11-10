import { EventEmitter } from "events";

type MockOverrides = { variableValues?: { topic?: string } };

const SPEAK_MS = 1500;
const PAUSE_MS = 700;

// Stand-in for the Vapi client that replays a scripted lesson locally,
// so the session UI and session history can be tested without spending call credits.
export class MockVapi extends EventEmitter {
    private timers: ReturnType<typeof setTimeout>[] = [];
    private active = false;
    private muted = false;

    async start(_assistant?: unknown, overrides?: MockOverrides) {
        const topic = overrides?.variableValues?.topic ?? 'today\'s topic';
        const script: { role: 'assistant' | 'user'; text: string }[] = [
            { role: 'assistant', text: `Hello, let's start the session. Today we'll be talking about ${topic}.` },
            { role: 'user', text: 'Sounds good, where should we begin?' },
            { role: 'assistant', text: `Let's start with the core idea behind ${topic}, then work through an example.` },
            { role: 'user', text: 'Okay, I think I follow so far.' },
            { role: 'assistant', text: 'Great. Try explaining it back to me in your own words.' },
        ];

        this.active = true;
        let t = 800;
        this.schedule(t, () => this.emit('call-start'));

        for(const line of script) {
            t += PAUSE_MS;
            if(line.role === 'assistant') this.schedule(t, () => this.emit('speech-start'));
            t += SPEAK_MS;
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
