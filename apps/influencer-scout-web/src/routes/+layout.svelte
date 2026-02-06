<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '@fontsource-variable/fraunces';
	import '@fontsource-variable/space-grotesk';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Instant Coffee</title>
	<meta
		name="description"
		content="Instant, rustic influencer discovery. Weaviate-powered search with fast results."
	/>
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		/* Coffee / rustic palette */
		--bg0: #fbf2e7; /* oat milk */
		--bg1: #f3e5d3; /* parchment */
		--paper: #fff7ee; /* paper card */
		--ink: #2a1a11; /* espresso ink */
		--muted: rgba(42, 26, 17, 0.72);
		--muted2: rgba(42, 26, 17, 0.55);
		--accent: #b06d3d; /* caramel */
		--accent2: #5a3520; /* espresso */
		--warn: #c7862d; /* honey */
		--ok: #3f7a54; /* sage */
		--danger: #b6523f; /* clay */

		--radius-xl: 1.75rem;
		--radius-lg: 1.25rem;
		--radius-md: 0.95rem;
		--radius-sm: 0.75rem;

		--font-ui:
			'Space Grotesk Variable',
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			Helvetica,
			Arial;
		--font-display: 'Fraunces Variable', ui-serif, Georgia, 'Times New Roman', Times, serif;
	}

	:global(html, body) {
		height: 100%;
	}

	:global(body) {
		margin: 0;
		font-family: var(--font-ui);
		color: var(--ink);
		background:
			radial-gradient(900px 650px at 12% 10%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 62%),
			radial-gradient(800px 650px at 95% 30%, color-mix(in oklab, var(--accent2) 12%, transparent), transparent 62%),
			linear-gradient(180deg, var(--bg0), var(--bg1));
		overflow-x: hidden;
	}

	:global(a) {
		color: inherit;
	}

	:global(button, input, textarea, select) {
		font-family: inherit;
	}

	:global(.mono) {
		font-variant-numeric: tabular-nums;
	}
</style>
