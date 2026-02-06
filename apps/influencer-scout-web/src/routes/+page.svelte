<script lang="ts">
	import { animate, stagger, remove } from 'animejs';
	import { onMount } from 'svelte';
	import InfluencerCard from '$lib/components/InfluencerCard.svelte';
	import appIcon from '$lib/assets/favicon.svg';
	import type { WeaviateSearchResponse } from '$lib/types';

	let query = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let res = $state<WeaviateSearchResponse | null>(null);

	async function apiJson<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<{ status: number; data: T }> {
		const r = await fetch(path, {
			...init,
			headers: {
				...(init?.headers || {}),
				...(init?.json !== undefined ? { 'content-type': 'application/json' } : {})
			},
			body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body
		});
		let data: any = null;
		try {
			data = await r.json();
		} catch {
			// ignore
		}
		return { status: r.status, data };
	}

	async function runSearch() {
		error = null;
		res = null;

		const q = query.trim();
		if (!q) {
			error = 'Type a query first.';
			return;
		}

		busy = true;
		try {
			const { status, data } = await apiJson<any>('/api/weaviate/search', {
				method: 'POST',
				json: { query: q, top_k: 10 }
			});
			if (status !== 200) {
				error = data?.message || data?.error || 'Search failed.';
				return;
			}
			res = data as WeaviateSearchResponse;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Network error';
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		const hero = document.querySelectorAll('[data-hero]');
		remove(hero);
		animate(hero, {
			opacity: [0, 1],
			translateY: [10, 0],
			duration: 850,
			delay: stagger(120),
			easing: 'easeOutExpo'
		});

		const blobs = document.querySelectorAll('[data-blob]');
		animate(blobs, {
			translateY: [0, -8],
			direction: 'alternate',
			loop: true,
			duration: 2600,
			delay: stagger(240),
			easing: 'easeInOutSine'
		});
	});
</script>

<div class="shell">
	<div class="bg">
		<div class="blob b1" data-blob></div>
		<div class="blob b2" data-blob></div>
		<div class="grain"></div>
	</div>

	<header class="topbar">
		<div class="brand">
			<div class="logo" aria-hidden="true">
				<img class="logo-img" src={appIcon} alt="" />
			</div>
			<div class="brand-text">
				<div class="title">Instant Coffee</div>
				<div class="subbrand">a demo from penni ai ☕</div>
			</div>
		</div>
	</header>

	<main class="grid">
		<section class="hero">
			<div class="kicker" data-hero>
				<span class="bean" aria-hidden="true"></span>
				Instant, rustic, minimal.
			</div>
			<h1 class="h1" data-hero>
				Instant Coffee
				<span class="grad">influencer search.</span>
			</h1>
			<p class="sub" data-hero>
				A single Weaviate-powered search that returns up to 10 creators. No toggles. No filters. Just pour and go.
			</p>

			<div class="dev-ctas" data-hero>
				<a class="cta dark" href="https://api.penni-ai.com/openapi.yaml" target="_blank" rel="noreferrer">API</a>
				<a
					class="cta dark"
					href="https://github.com/maikyonn/influencer-scout/tree/main/apps/mcp-server"
					target="_blank"
					rel="noreferrer"
					>MCP</a
				>
				<a
					class="cta dark"
					href="https://github.com/maikyonn/influencer-scout/blob/main/skills/clawdbot-influencer-scout/SKILL.md"
					target="_blank"
					rel="noreferrer"
					>Clawdbot</a
				>
			</div>
		</section>

		<section class="panel">
			<div class="panel-head">
				<div class="panel-title">Instant Coffee</div>
				<div class="hint">Weaviate only, max 10</div>
			</div>

			<div class="panel-body">
				<div class="field">
					<label for="q">Query</label>
					<input
						id="q"
						placeholder="Ex: austin coffee creators, cozy lifestyle, streetwear nyc"
						bind:value={query}
						onkeydown={(e) => e.key === 'Enter' && runSearch()}
					/>
				</div>

				<div class="row">
					<div class="note">Any platform.</div>
					<button class="run" disabled={busy} onclick={runSearch}>
						{busy ? 'Brewing…' : 'Search'}
					</button>
				</div>

				{#if error}
					<div class="alert danger">{error}</div>
				{/if}

				{#if res?.candidates?.length}
					<div class="block">
						<div class="block-title">Candidates</div>
						<div class="cards">
							{#each res.candidates.slice(0, 10) as c (c.profile_url)}
								<InfluencerCard
									profile={{
										profile_url: c.profile_url,
										platform: c.platform,
										display_name: c.display_name,
										followers: c.followers
									}}
								/>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</section>
	</main>

	<footer class="foot">
		<div class="logo-bar" aria-label="Customer logos (placeholders)">
			<div class="logo-strip">
				<span class="logo-mark">SUNO</span>
				<span class="sep">|</span>
				<span class="logo-mark">DR</span>
				<span class="sep">|</span>
				<span class="logo-mark">ElevenLabs</span>
				<span class="sep">|</span>
				<span class="logo-mark">ByteDance</span>
				<span class="sep">|</span>
				<span class="logo-mark">NORMAKAMALI</span>
				<span class="sep">|</span>
				<span class="logo-mark">CASETiFY</span>
			</div>
		</div>

		<div class="foot-row">
			<div class="foot-left">Instant Coffee</div>
			<div class="foot-right">
				<a href="https://api.penni-ai.com" target="_blank" rel="noreferrer">API Host</a>
				<a href="https://github.com/maikyonn/influencer-scout" target="_blank" rel="noreferrer">GitHub</a>
			</div>
		</div>
	</footer>
</div>

<style>
	.shell {
		min-height: 100vh;
		display: grid;
		grid-template-rows: auto 1fr auto;
		padding: 1.25rem;
		position: relative;
	}

	.bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.blob {
		position: absolute;
		width: 44rem;
		height: 44rem;
		border-radius: 999px;
		filter: blur(0.5px);
		opacity: 0.28;
		mix-blend-mode: multiply;
	}

	.b1 {
		left: -12rem;
		top: -10rem;
		background:
			radial-gradient(circle at 48% 52%, transparent 54%, color-mix(in oklab, var(--accent2) 38%, transparent) 55%, transparent 70%),
			radial-gradient(circle at 46% 50%, transparent 60%, color-mix(in oklab, var(--accent) 20%, transparent) 61%, transparent 82%);
	}

	.b2 {
		right: -18rem;
		top: 5rem;
		background:
			radial-gradient(circle at 48% 52%, transparent 56%, color-mix(in oklab, var(--accent) 34%, transparent) 57%, transparent 73%),
			radial-gradient(circle at 50% 50%, transparent 64%, color-mix(in oklab, var(--accent2) 16%, transparent) 65%, transparent 86%);
	}

	.grain {
		position: absolute;
		inset: -30%;
		background-image:
			url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"220\" height=\"220\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"220\" height=\"220\" filter=\"url(%23n)\" opacity=\"0.18\"/></svg>');
		mix-blend-mode: overlay;
		opacity: 0.18;
		transform: rotate(10deg);
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 0.25rem 1.25rem;
		position: relative;
		z-index: 2;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.brand-text {
		display: grid;
		gap: 0.1rem;
	}

	.logo {
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 0.9rem;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 70%, #fff7ee), color-mix(in oklab, var(--accent2) 85%, black));
		box-shadow: 0 14px 45px color-mix(in oklab, var(--accent2) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--accent2) 22%, transparent);
	}

	.logo-img {
		width: 1.65rem;
		height: 1.65rem;
		display: block;
		filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.25));
	}

	.title {
		font-weight: 760;
		letter-spacing: -0.02em;
	}

	.subbrand {
		color: var(--muted2);
		font-size: 0.84rem;
		letter-spacing: 0.01em;
	}

	.grid {
		display: grid;
		grid-template-columns: 1.05fr 1fr;
		gap: 1.25rem;
		align-items: start;
		position: relative;
		z-index: 2;
	}

	.hero {
		padding: 1.25rem 1rem;
	}

	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		border-radius: 999px;
		background: color-mix(in oklab, white 78%, var(--paper));
		border: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
		color: var(--muted);
		font-size: 0.92rem;
	}

	.bean {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 999px;
		background: linear-gradient(180deg, color-mix(in oklab, var(--accent) 75%, white), color-mix(in oklab, var(--accent2) 80%, black));
		position: relative;
		box-shadow: 0 8px 22px color-mix(in oklab, var(--accent2) 14%, transparent);
	}

	.bean::after {
		content: '';
		position: absolute;
		inset: 0.13rem 0.34rem 0.13rem 0.34rem;
		border-radius: 999px;
		background: color-mix(in oklab, white 25%, transparent);
		opacity: 0.45;
	}

	.h1 {
		margin: 1rem 0 0.75rem;
		font-size: clamp(2.3rem, 3vw, 3.3rem);
		line-height: 0.98;
		letter-spacing: -0.04em;
		font-family: var(--font-display);
		font-variation-settings: 'wght' 650;
	}

	.grad {
		background: linear-gradient(90deg, var(--accent), var(--accent2));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.sub {
		color: var(--muted);
		max-width: 48ch;
		line-height: 1.35;
		margin: 0 0 1.1rem;
	}

	.cta {
		border: 0;
		cursor: pointer;
		padding: 0.8rem 1rem;
		border-radius: 1rem;
		font-weight: 680;
		color: #fff7ee;
		background: linear-gradient(90deg, color-mix(in oklab, var(--accent) 92%, #fff7ee), var(--accent2));
		box-shadow: 0 18px 55px color-mix(in oklab, var(--accent2) 14%, transparent);
		transition: transform 140ms ease;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}

	.cta:hover {
		transform: translateY(-1px);
	}

	.cta.dark {
		background: color-mix(in oklab, var(--accent2) 92%, black);
		border: 1px solid color-mix(in oklab, #fff 10%, transparent);
		box-shadow: 0 18px 55px color-mix(in oklab, var(--accent2) 10%, transparent);
	}

	.dev-ctas {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.panel {
		border-radius: var(--radius-xl);
		background: color-mix(in oklab, white 84%, var(--paper));
		border: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
		box-shadow:
			0 25px 85px color-mix(in oklab, var(--accent2) 8%, transparent),
			inset 0 1px 0 rgba(255, 255, 255, 0.65);
		overflow: hidden;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 0.85rem;
		border-bottom: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
		background: color-mix(in oklab, white 88%, var(--paper));
	}

	.panel-title {
		font-weight: 760;
		letter-spacing: -0.02em;
	}

	.hint {
		color: var(--muted2);
		font-size: 0.9rem;
	}

	.panel-body {
		padding: 0.9rem;
		display: grid;
		gap: 0.85rem;
	}

	.field {
		display: grid;
		gap: 0.35rem;
	}

	label {
		color: var(--muted2);
		font-size: 0.82rem;
	}

	input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.65rem 0.75rem;
		border-radius: 0.9rem;
		border: 1px solid color-mix(in oklab, var(--ink) 12%, transparent);
		background: color-mix(in oklab, white 92%, var(--paper));
		color: var(--ink);
		outline: none;
	}

	input:focus {
		border-color: color-mix(in oklab, var(--accent) 45%, transparent);
		box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 16%, transparent);
	}

	.row {
		display: flex;
		align-items: end;
		gap: 0.8rem;
	}

	.note {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.run {
		border: 0;
		cursor: pointer;
		padding: 0.78rem 0.95rem;
		border-radius: 1rem;
		font-weight: 720;
		color: #fff7ee;
		background: linear-gradient(90deg, var(--accent2), color-mix(in oklab, var(--accent) 92%, #fff7ee));
		box-shadow: 0 18px 50px color-mix(in oklab, var(--accent2) 16%, transparent);
		transition: transform 140ms ease, filter 140ms ease;
	}

	.run:disabled {
		opacity: 0.65;
		cursor: not-allowed;
		filter: grayscale(0.2);
	}

	.run:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	.alert {
		padding: 0.75rem 0.8rem;
		border-radius: 1rem;
		border: 1px solid;
		font-size: 0.92rem;
	}

	.alert.danger {
		border-color: color-mix(in oklab, var(--danger) 55%, transparent);
		background: color-mix(in oklab, var(--danger) 16%, transparent);
	}

	.block {
		border-radius: 1.25rem;
		border: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
		background: color-mix(in oklab, white 88%, var(--paper));
		padding: 0.85rem;
		display: grid;
		gap: 0.65rem;
	}

	.block-title {
		color: var(--muted2);
		font-size: 0.85rem;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.foot {
		display: grid;
		gap: 0.85rem;
		padding: 1.25rem 0 0.2rem;
		color: var(--muted2);
		font-size: 0.95rem;
		position: relative;
		z-index: 2;
	}

	.logo-bar {
		border-radius: 1.1rem;
		background: color-mix(in oklab, var(--accent2) 92%, black);
		border: 1px solid color-mix(in oklab, #fff 10%, transparent);
		box-shadow: 0 28px 90px color-mix(in oklab, var(--accent2) 12%, transparent);
		padding: 0.9rem 1rem;
		overflow: hidden;
	}

	.logo-strip {
		display: flex;
		gap: 1.2rem;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		color: #f7eee2;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.logo-mark {
		font-weight: 800;
		font-size: 0.95rem;
	}

	.sep {
		opacity: 0.35;
	}

	.foot-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0 0.25rem;
	}

	.foot-right {
		display: flex;
		gap: 0.9rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.foot a {
		text-decoration: none;
		border-bottom: 1px dashed color-mix(in oklab, var(--ink) 20%, transparent);
	}

	@media (max-width: 960px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.hero {
			padding: 0.5rem 0.25rem 0;
		}
		.cards {
			grid-template-columns: 1fr;
		}
		.logo-strip {
			justify-content: center;
		}
	}
</style>
