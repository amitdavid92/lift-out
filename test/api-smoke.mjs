// Sends the two real requests the extension makes, using ANTHROPIC_API_KEY.
// Costs a fraction of a cent per run.
import Anthropic from "@anthropic-ai/sdk";
import { describeRequest, relatedRequest, parseRelated } from "../src/requests.js";

const client = new Anthropic();

const block = {
  text: "The council voted 9–4 on Tuesday to approve Phase 2 of the harbour tram, a 6.2 km extension that the transport authority says will be funded through a mix of a municipal bond issuance and a ring-fenced levy on commercial ratepayers within the Eastside catchment, subject to the capex ceiling set out in the 2024 framework agreement.",
  truncated: false,
  images: [],
  title: "City council votes on tram extension | The Harbour Post",
  url: "https://example.com/tram",
  heading: "City council votes on tram extension",
  tag: "p",
  role: "",
};
const candidates = [
  { id: 0, heading: "Most read", text: "Ferry timetable changes. Harbour bridge closure. Quiz of the week." },
  { id: 1, heading: "What it will cost", text: "Estimated cost by component (millions): Track and civil works 88, 97. Utility relocation 19, 41." },
  { id: 2, heading: "Who pays the levy", text: "Commercial properties within 800 metres of a new stop will pay the levy for fifteen years." },
  { id: 3, heading: "", text: "1. The 2024 framework agreement caps the city's capital contribution at 200 million across both phases." },
];

const t0 = Date.now();
let first = null;
const stream = client.beta.messages.stream(describeRequest(block));
let text = "";
for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    first ??= Date.now() - t0;
    text += event.delta.text;
  }
}
const final = await stream.finalMessage();
console.log(`--- description (first text ${first} ms, total ${Date.now() - t0} ms, stop_reason ${final.stop_reason}, model ${final.model})\n${text}\n`);

const t1 = Date.now();
const related = await client.beta.messages.create(relatedRequest(block, candidates));
console.log(`--- related (${Date.now() - t1} ms, stop_reason ${related.stop_reason})`);
console.log(parseRelated(related, candidates.length));
