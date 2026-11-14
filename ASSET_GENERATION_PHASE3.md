# Phase 3 artwork provenance

Generated furniture, cat and donut with the built-in imagegen tool. The plant, pencil, room shell, frame, lamp, door, rug, micro-props and four thumbnails are authored vector artwork in `scripts/compose-assets.ts`. These are image assets only; no runtime image-generation or background-removal service is part of the application. Existing user uploads and legacy preset PNGs remain unchanged.

Files are copied into `client/public/assets/illustrations/phase3/`. Image bytes are preserved, with native alpha. The typed registry stores canvas dimensions and alpha subject bounds; the UI uses an SVG viewport to fit transparent padding without editing the raster.

## desk

Use case: illustration-story. Asset for an interactive university shared-study room, not an interface screenshot. Style: quiet 2D architectural hand drawing in near-black ink, subtly imperfect single contours of even medium-fine weight, matching a minimal sketchbook illustration on warm ivory paper. Furniture surfaces opaque warm off-white #FFFCF8, very sparse light beige accent, no shadows, no gradients, no photorealism, no heavy texture, no text, no labels, no logos, no watermarks. Background must be truly transparent alpha. Subject fully in frame with very little transparent margin, centered; it will be layered with other independent images. Frontal view with a slight view down onto horizontal surfaces, not isometric, not three-quarter view. Primary request: One simple long shared study desk with a thin rectangular tabletop, gentle trapezoid perspective (back edge narrower), two slim slightly splayed front legs and two faint rear legs. No drawers, no chair, no laptop, no people, no accessories. Horizontally wide 3:1 subject, tabletop at upper quarter, legs reaching baseline. Black hand ink contours, white/ivory filled surfaces.

## chair

Use case: illustration-story. Asset for an interactive university shared-study room, not an interface screenshot. Style: quiet 2D architectural hand drawing in near-black ink, subtly imperfect single contours of even medium-fine weight, matching a minimal sketchbook illustration on warm ivory paper. Furniture surfaces opaque warm off-white #FFFCF8, very sparse light beige accent, no shadows, no gradients, no photorealism, no heavy texture, no text, no labels, no logos, no watermarks. Background must be truly transparent alpha. Subject fully in frame with very little transparent margin, centered; it will be layered with other independent images. Frontal view with a slight view down onto horizontal surfaces, not isometric, not three-quarter view. Primary request: One empty white rolling study chair seen from the FRONT: rounded low rectangular backrest, slim arm rests, simple horizontal seat, narrow center stem with five slender spokes and little wheels. No desk, no person, no laptop, no other objects. Tall centered 3:4 subject. Warm ivory opaque seat/back with black ink outline. Entire chair from backrest top to wheels must be visible.

## laptop

Use case: illustration-story. Asset for an interactive university shared-study room, not an interface screenshot. Style: quiet 2D architectural hand drawing in near-black ink, subtly imperfect single contours of even medium-fine weight, matching a minimal sketchbook illustration on warm ivory paper. Furniture surfaces opaque warm off-white #FFFCF8, very sparse light beige accent, no shadows, no gradients, no photorealism, no heavy texture, no text, no labels, no logos, no watermarks. Background must be truly transparent alpha. Subject fully in frame with very little transparent margin, centered; it will be layered with other independent images. Frontal view with a slight view down onto horizontal surfaces, not isometric, not three-quarter view. Primary request: One open laptop seen from BEHIND its screen, as in a scene where an avatar sits behind it at a desk. Plain slightly tilted light warm-grey lid is a broad near-rectangle, slightly skewed, rounded corners, narrow flat base visible at the bottom. No screen content, no logo, no keyboard detail, no hands, no desk. Wide 4:3 subject. This is a small foreground prop; prioritize an elegant simple outline and unobstructive plain light-grey lid.

## bookshelf

Use case: illustration-story. A replaceable layer for the same cozy university shared-study room art family. Fine slightly imperfect near-black ink outlines, flat warm ivory #FFFCF8 opaque object fills, very sparse pale warm beige accents, almost no shading, minimal 2D hand drawing. Gentle frontal architectural perspective with a tiny view of top surfaces, NOT isometric. No people, no text, no words, no labels, no UI, no logos. Truly transparent alpha background, no ground shadow, whole object centered and fully in frame with small transparent margins. The drawing must be uncluttered and readable at 120px tall. Primary request: A narrow compact office bookcase/filing cabinet, 3:5 tall. Several standing books and a little potted plant rest on its top. Below them one wide blank upper drawer front, one open middle shelf holding books/folders, and two closed bottom drawers with tiny handles. Delicate hand-ink contours, thin feet. Keep the upper drawer panel blank with enough white space for a real HTML label.

## cabinet

Use case: illustration-story. A replaceable layer for the same cozy university shared-study room art family. Fine slightly imperfect near-black ink outlines, flat warm ivory #FFFCF8 opaque object fills, very sparse pale warm beige accents, almost no shading, minimal 2D hand drawing. Gentle frontal architectural perspective with a tiny view of top surfaces, NOT isometric. No people, no text, no words, no labels, no UI, no logos. Truly transparent alpha background, no ground shadow, whole object centered and fully in frame with small transparent margins. The drawing must be uncluttered and readable at 120px tall. Primary request: A small narrow two-drawer filing cabinet, 3:4 subject, frontal with a visible thin top. Simple tiny horizontal handles, clean warm white fronts. On top, a modest empty document inbox tray with one tilted BLANK standing rectangular paper sign resting in it. No words on the paper, no books, no plant, no other furnishings. The blank sign must have dark outline and clear margins.

## plant-refined — rejected candidate

Preserve plant shape, white pot and ink lines; replace fuzzy glow/haze with clean native transparency and opaque flat sage leaves.

## preset-pencil — rejected candidate

Use case: illustration-story. Asset: one charming preset avatar to sit behind a hand-drawn laptop in a cozy university group project workspace. Single character cutout on truly transparent alpha background. Preserve all character edges cleanly; NO glow, no halo, no drop shadow, no ground, no rectangle. Frontal seated-height composition, whole character centered with small margins and baseline at bottom, no chair or desk or laptop. Warm gentle tactile colors and a small sweet face, not a glossy corporate emoji, no text, no watermark. Primary request: A cute yellow wooden pencil character, slightly tilted 10 degrees, black graphite point at top, pink eraser at bottom, little friendly black eyes and curved smile on yellow barrel, soft subtle realistic pencil texture but restrained cartoon face. Short enough to fit seated avatar proportions, no arms or legs, whole pencil visible.

## preset-cat

Use case: illustration-story. Asset: one charming preset avatar to sit behind a hand-drawn laptop in a cozy university group project workspace. Single character cutout on truly transparent alpha background. Preserve all character edges cleanly; NO glow, no halo, no drop shadow, no ground, no rectangle. Frontal seated-height composition, whole character centered with small margins and baseline at bottom, no chair or desk or laptop. Warm gentle tactile colors and a small sweet face, not a glossy corporate emoji, no text, no watermark. Primary request: A fluffy white-and-cocoa ragdoll cat sitting upright, head, chest, front paws and body visible, blue eyes looking gently toward viewer, realistic natural fur with soft edges, calm sweet expression. It should look like an actual clean photo cutout of a real cat, not an outlined cartoon. No collar, no accessories.

## preset-donut

Use case: illustration-story. Asset: one charming preset avatar to sit behind a hand-drawn laptop in a cozy university group project workspace. Single character cutout on truly transparent alpha background. Preserve all character edges cleanly; NO glow, no halo, no drop shadow, no ground, no rectangle. Frontal seated-height composition, whole character centered with small margins and baseline at bottom, no chair or desk or laptop. Warm gentle tactile colors and a small sweet face, not a glossy corporate emoji, no text, no watermark. Primary request: A cheerful round doughnut mascot with pastel strawberry-pink icing and sparse tiny colorful sprinkles, warm baked dough edge and a real hole, two small dark eyes and a subtle happy smile below the hole. Soft tactile slightly dimensional bakery texture like a photographed little toy, not a hard glossy 3D render. Whole donut visible, no arms or legs.

## Accepted outputs

| Registry key | Generated source filename | Shipped filename |
|---|---|---|
| desk-top | exec-092f65fa-8780-4cc6-98ef-922eb7bc6842.png | desk.png |
| chair | exec-fedfa30a-ab97-436f-ad61-fb897927fc7f.png | chair.png |
| laptop-front | exec-de5cc9ca-1230-49c1-9175-450633673173.png | laptop.png |
| bookshelf-files | exec-4f0473cc-33be-438e-902a-60dee4d0092e.png | bookshelf.png |
| submit-tray-sign | exec-3ac4ca9a-3744-487e-b8c4-732df9d3a58c.png | cabinet.png |
| cat | exec-20084fcf-a4ac-472a-80a6-4e3842e73615.png | cat.png |
| donut | exec-9c19cf92-4de0-4a7d-902b-3cd43459ad8b.png | donut.png |

Both plant candidates and the generated pencil had visible fuzzy halos. They are not shipped or used. Final plant SVG and pencil PNG use the authored ink family; the pencil PNG is rendered directly from its vector source. No programmatic cutout/background-removal step was used. Generated PNG bytes were copied unchanged; alpha bounds are display metadata only. Runtime avatar uploads are never sent through image generation.
