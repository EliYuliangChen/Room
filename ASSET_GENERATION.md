# Phase 1 illustration provenance

The built-in **imagegen** tool generated the decorative Landing hero and it was inspected before integration.

- Workspace path: `client/public/assets/illustrations/landing-office.png`
- Dimensions: 1536 × 1024.
- Input: text brief only. Supplied reference JPGs were inspected for art direction; no reference screenshot is used as app UI.
- Mode: built-in image generation; no API key, CLI fallback or automatic background-removal service.

Final generation prompt:

> Use case: illustration-story. Asset type: landing-office hero illustration for Project Room, a university group coursework local desktop demo. Create a calm cozy minimalist two-dimensional hand-drawn small shared study office in architectural front perspective: two desks side by side with empty rolling chairs and open laptops, a blank framed whiteboard centered on the back wall, pendant ceiling lamp, small bookshelf at left, a leafy muted sage plant, cream woven rug. Sparse imperfect fine near-black ink contours on flat warm ivory #FFFCF8 paper, very light warm beige accents, generous whitespace. Consistent charming sketchbook furniture, almost no shading. Composition landscape 3:2, complete room visible with clean margins, objects proportionate, quiet uncluttered. No humans, no avatars, no text, no words, no logos, no interface, no buttons, no watermark. This is decorative artwork only; all dynamic UI text is rendered separately. Save as a high quality PNG.

Other included Phase 1 assets are hand-authored SVG placeholders from `scripts/create-assets.ts`; transparent PNG presets are rendered from those original vector drawings using Resvg. They are not presented as finished generated illustrations. The asset metadata records their status, dimensions, anchors and z-index. `npm run assets` rebuilds those vector assets and metadata; it preserves the included generated hero.

Local fonts: Kalam and Nunito Sans, distributed by the corresponding `@fontsource` packages under the SIL Open Font License. License copies are included in `client/public/assets/licenses/`. Icons use `lucide-react` under the ISC License.
