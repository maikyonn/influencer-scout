<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '@fontsource-variable/space-grotesk';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Influencer Scout</title>
	<meta
		name="description"
		content="Find high-fit influencers fast. Weaviate-powered discovery + automated enrichment and ranking."
	/>
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--bg0: #070a12;
		--bg1: #0b1227;
		--paper: #0e1630;
		--ink: #e9edf7;
		--muted: rgba(233, 237, 247, 0.72);
		--muted2: rgba(233, 237, 247, 0.55);
		--accent: #ff4fd8;
		--accent2: #3df2ff;
		--warn: #ffce4a;
		--ok: #35f28a;
		--danger: #ff5b5b;

		--radius-xl: 1.75rem;
		--radius-lg: 1.25rem;
		--radius-md: 0.95rem;
		--radius-sm: 0.75rem;
	}

	:global(html, body) {
		height: 100%;
	}

	:global(body) {
		margin: 0;
		font-family:
			'Space Grotesk Variable',
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			Helvetica,
			Arial,
			'Apple Color Emoji',
			'Segoe UI Emoji';
		color: var(--ink);
		background:
			radial-gradient(900px 650px at 10% 15%, color-mix(in oklab, var(--accent2) 28%, transparent), transparent 60%),
			radial-gradient(900px 650px at 95% 30%, color-mix(in oklab, var(--accent) 25%, transparent), transparent 62%),
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
