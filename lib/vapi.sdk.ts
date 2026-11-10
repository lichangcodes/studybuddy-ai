import Vapi from "@vapi-ai/web";
import { MockVapi } from "@/lib/vapi.mock";

const useMock = process.env.NEXT_PUBLIC_VAPI_MOCK === 'true';

if(useMock && typeof window !== 'undefined') {
    console.info('[vapi] Mock mode: sessions are simulated and use no Vapi credits.');
}

// MockVapi implements the subset of the client the app uses (on/off, start, stop, mute).
export const vapi: Vapi = useMock
    ? (new MockVapi() as unknown as Vapi)
    : new Vapi(process.env.NEXT_PUBLIC_VAPI_WEB_TOKEN!);
