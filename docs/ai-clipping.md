# AI clipping

AI clipping finds self-contained excerpts in spoken video. Whisper transcribes locally using the existing checksummed base model. After explicit transcript-sharing and credit approval, Heis submits the timed transcript to Runware text inference (`openai:gpt@5.4-mini`). The model returns ranked cue indexes, titles and editorial reasons. The server validates all ranges against actual transcript boundaries and removes overlapping suggestions before storing a JSON result and settling credits.

The review workspace previews source ranges, supports timing edits and selection, and creates only the selected clips using local FFmpeg. Clips preserve original framing and audio. Results are imported into the source project or local library with descriptive titles. They do not replace timeline content automatically. Project switching cannot redirect an in-progress local job.

## Scope and limits

- Intended for interviews, podcasts, talks, and tutorials. No visual action analysis, face tracking, automatic reframing, or predicted virality claims.
- One source video up to two hours; up to 3,000 transcript cues or 120,000 transcript characters. Inputs beyond those limits fail explicitly without truncation.
- Request 1 to 10 suggestions, each 5 to 180 seconds. The model can return fewer or no suitable suggestions. No deterministic windows are substituted for failed AI results.
- Review and adjust timestamps before extraction. Local reviewed ranges must be between 1 and 180 seconds and inside the source duration.
- Transcript sharing and ranking require managed-generation access and credits. Local transcription and clip extraction do not consume generation credits.
- Local jobs retain history, support cancellation, and report interruption after restart. Use Transcribe again or the editor job Retry action after interruption. Pending remote analysis can be resumed without submitting another paid request. Completed analysis and manual timing edits are saved locally per source.

## Deployment and validation

Deploy the updated core catalog, hosted generation API, and Trigger.dev worker before releasing the desktop build. Existing Runware credentials, credit accounting, and object storage are reused. No database migration or new provider account is needed.

Provider contract: https://runware.ai/docs/models/openai-gpt-5-4-mini

Run `npm test`, `npm run typecheck:editor`, and `npm run typecheck -w @heis/web`. Build the core, Electron main/preload, and desktop renderer before `npm run test:clipping-desktop`. The native smoke test uses macOS speech synthesis, real local Whisper transcription and FFmpeg clip extraction. Only the paid ranking response is mocked. Set `HEIS_WHISPER_MODEL` to an existing verified base model to avoid downloading it for the test.

A paid live ranking request and deployed-service verification have not been performed. Before release, verify editorial quality on representative long-form sources and exercise the deployed billing/provider path.
