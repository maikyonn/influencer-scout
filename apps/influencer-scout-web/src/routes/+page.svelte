<script lang="ts">
	import { animate, stagger, remove } from 'animejs';
	import { onDestroy, onMount } from 'svelte';
	import Waterfall from '$lib/components/Waterfall.svelte';
	import InfluencerCard from '$lib/components/InfluencerCard.svelte';
	import { fmtInt } from '$lib/utils/format';
	import type {
		PipelineEventsResponse,
		PipelineFinalArtifact,
		PipelineJobStatus,
		Platform,
		WeaviateSearchResponse,
		WaterfallTimingArtifact
	} from '$lib/types';

	type Mode = 'pipeline' | 'weaviate';

	let mode: Mode = $state('pipeline');

	// Shared controls
	let platform: Platform | '' = $state('');

	// Pipeline inputs/state
	let businessDescription = $state('');
	let pipelineBusy = $state(false);
	let pipelineError = $state<string | null>(null);

	let job: PipelineJobStatus | null = $state(null);
	let timing: WaterfallTimingArtifact | null = $state(null);
	let progressive: any | null = $state(null);
	let final: PipelineFinalArtifact | null = $state(null);
	let events: any[] = $state([]);
	let lastEventId = $state(0);
	let pollTimer: number | null = $state(null);

	// Weaviate inputs/state
	let query = $state('');
	let weaviateBusy = $state(false);
	let weaviateError = $state<string | null>(null);
	let weaviateRes: WeaviateSearchResponse | null = $state(null);

	async function apiJson<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<{ status: number; data: T }> {
		const res = await fetch(path, {
			...init,
			headers: {
				...(init?.headers || {}),
				...(init?.json !== undefined ? { 'content-type': 'application/json' } : {})
			},
			body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body
		});
		let data: any = null;
		try {
			data = await res.json();
		} catch {
			// ignore
		}
		return { status: res.status, data };
	}

	function stopPolling() {
		if (pollTimer != null) {
			window.clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	async function refreshPipeline(jobId: string) {
		const [jobRes, evRes] = await Promise.all([
			apiJson<PipelineJobStatus>(`/api/pipeline/jobs/${jobId}`),
			apiJson<PipelineEventsResponse>(`/api/pipeline/jobs/${jobId}/events?after=${lastEventId}`)
		]);

		if (jobRes.status === 200) job = jobRes.data;
		if (evRes.status === 200 && Array.isArray((evRes.data as any).events)) {
			const next = (evRes.data as any).events as any[];
			if (next.length) {
				events = [...events, ...next].slice(-300);
				const maxId = next.reduce((m, e) => Math.max(m, Number(e.id || 0)), lastEventId);
				lastEventId = maxId;
			}
		}

		// Pull artifacts less frequently (and only when job exists)
		if (jobRes.status === 200 && Math.random() < 0.35) {
			const [timingRes, progRes] = await Promise.all([
				apiJson<WaterfallTimingArtifact>(`/api/pipeline/jobs/${jobId}/artifacts/timing`),
				apiJson<any>(`/api/pipeline/jobs/${jobId}/artifacts/progressive`)
			]);
			if (timingRes.status === 200) timing = timingRes.data;
			if (progRes.status === 200) progressive = progRes.data;
		}

		if (jobRes.status === 200 && jobRes.data.status === 'completed' && !final) {
			const finRes = await apiJson<PipelineFinalArtifact>(`/api/pipeline/jobs/${jobId}/results`);
			if (finRes.status === 200) final = finRes.data;
		}

		if (jobRes.status === 200 && ['completed', 'error', 'cancelled'].includes(jobRes.data.status)) {
			stopPolling();
		}
	}

	async function startPipeline() {
		stopPolling();
		pipelineError = null;
		final = null;
		progressive = null;
		timing = null;
		events = [];
		lastEventId = 0;
		job = null;

		if (!businessDescription.trim()) {
			pipelineError = 'Tell us what you’re selling or promoting.';
			return;
		}

		pipelineBusy = true;
		try {
			const { status, data } = await apiJson<any>('/api/pipeline/start', {
				method: 'POST',
				json: {
					business_description: businessDescription.trim(),
					top_n: 10,
					platform: platform || undefined
				}
			});

			if (status !== 202 || !data?.job_id) {
				pipelineError = data?.message || data?.error || 'Could not start job.';
				return;
			}

			const jobId = String(data.job_id);
			await refreshPipeline(jobId);
			pollTimer = window.setInterval(() => refreshPipeline(jobId), 1000);
		} catch (e) {
			pipelineError = e instanceof Error ? e.message : 'Network error';
		} finally {
			pipelineBusy = false;
		}
	}

	async function cancelPipeline() {
		if (!job?.job_id) return;
		try {
			await apiJson(`/api/pipeline/jobs/${job.job_id}/cancel`, { method: 'POST' });
			await refreshPipeline(job.job_id);
		} catch {
			// ignore
		}
	}

	async function runWeaviate() {
		weaviateError = null;
		weaviateRes = null;

		const q = query.trim();
		if (!q) {
			weaviateError = 'Type a query first.';
			return;
		}

		weaviateBusy = true;
		try {
			const { status, data } = await apiJson<any>('/api/weaviate/search', {
				method: 'POST',
				json: {
					query: q,
					top_k: 10,
					platform: platform || undefined
				}
			});
			if (status !== 200) {
				weaviateError = data?.message || data?.error || 'Search failed.';
				return;
			}
			weaviateRes = data as WeaviateSearchResponse;
		} catch (e) {
			weaviateError = e instanceof Error ? e.message : 'Network error';
		} finally {
			weaviateBusy = false;
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

	onDestroy(stopPolling);
</script>

<div class="shell">
	<div class="bg">
		<div class="blob b1" data-blob></div>
		<div class="blob b2" data-blob></div>
		<div class="grain"></div>
	</div>

	<header class="topbar">
		<div class="brand">
			<div class="logo">IS</div>
			<div class="title">Influencer Scout</div>
		</div>
	</header>

	<main class="grid">
		<section class="hero">
			<div class="kicker" data-hero>
				<span class="bean" aria-hidden="true"></span>
				Brew a shortlist in minutes.
			</div>
			<h1 class="h1" data-hero>
				Find creators that actually fit
				<span class="grad">your brand.</span>
			</h1>
			<p class="sub" data-hero>
				Quick search for a first pour, or run the full pipeline to enrich profiles and rank them. Rustic UX, modern
				stack.
			</p>

			<div class="hero-ctas" data-hero>
				<button class="cta" onclick={() => (mode = 'pipeline')} class:active={mode === 'pipeline'}>
					Ranked Pipeline
				</button>
				<button class="cta ghost" onclick={() => (mode = 'weaviate')} class:active={mode === 'weaviate'}>
					Quick Search
				</button>
			</div>

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
				<div class="tabs">
					<button class="tab" class:active={mode === 'pipeline'} onclick={() => (mode = 'pipeline')}>
						Pipeline
					</button>
					<button class="tab" class:active={mode === 'weaviate'} onclick={() => (mode = 'weaviate')}>
						Weaviate
					</button>
				</div>
				<div class="hint">Public demo UI</div>
			</div>

			<div class="panel-body">
				<div class="controls">
					<div class="field">
						<label for="platform">Platform</label>
						<select id="platform" bind:value={platform}>
							<option value="">Any</option>
							<option value="instagram">Instagram</option>
							<option value="tiktok">TikTok</option>
						</select>
					</div>
				</div>

				{#if mode === 'pipeline'}
					<div class="field">
						<label for="business_description">What are you promoting?</label>
						<textarea
							id="business_description"
							rows="4"
							placeholder="Ex: Specialty coffee brand in Austin. Looking for cozy lifestyle creators who post recipe-style videos and feel authentic."
							bind:value={businessDescription}
						></textarea>
					</div>

					<div class="row">
						<div class="note">Returns up to 10 influencers.</div>
						<button class="run" disabled={pipelineBusy} onclick={startPipeline}>
							{pipelineBusy ? 'Starting…' : 'Scout'}
						</button>
					</div>

					{#if pipelineError}
						<div class="alert danger">{pipelineError}</div>
					{/if}

					{#if job}
						<div class="status">
							<div class="status-left">
								<div class="status-pill">
									<span class="dot"></span>
									<span class="mono">{job.status}</span>
								</div>
								<div class="status-meta">
									<div>Stage: <span class="mono">{job.current_stage || '—'}</span></div>
									<div>Progress: <span class="mono">{fmtInt(job.progress)}%</span></div>
								</div>
							</div>
							<button class="ghost-btn" disabled={job.status !== 'pending' && job.status !== 'running'} onclick={cancelPipeline}>
								Cancel
							</button>
						</div>

						<div class="block">
							<div class="block-title">Waterfall</div>
							<Waterfall {timing} />
						</div>

						<div class="block">
							<div class="block-title">Live events</div>
							<pre class="events mono">{events.map((e) => `[${e.ts}] ${e.type} ${JSON.stringify(e.data || {})}`).join('\n')}</pre>
						</div>

						{#if final?.profiles?.length}
							<div class="block">
								<div class="block-title">Top matches</div>
								<div class="cards">
									{#each final.profiles.slice(0, 10) as p (p.profile_url || p.url || p.display_name)}
										<InfluencerCard profile={p} />
									{/each}
								</div>
							</div>
						{:else if progressive?.profiles?.length}
							<div class="block">
								<div class="block-title">In progress</div>
								<div class="cards">
									{#each progressive.profiles.slice(0, 10) as p (p.profile_url || p.url || p.display_name)}
										<InfluencerCard profile={p} />
									{/each}
								</div>
							</div>
						{/if}
					{/if}
				{:else}
					<div class="field">
						<label for="weaviate_query">Query</label>
						<input
							id="weaviate_query"
							placeholder="Ex: vegan skincare creators, UGC, micro-influencers"
							bind:value={query}
							onkeydown={(e) => e.key === 'Enter' && runWeaviate()}
						/>
					</div>

					<div class="row">
						<div class="note">Returns up to 10 candidates.</div>
						<button class="run" disabled={weaviateBusy} onclick={runWeaviate}>
							{weaviateBusy ? 'Searching…' : 'Search'}
						</button>
					</div>

					{#if weaviateError}
						<div class="alert danger">{weaviateError}</div>
					{/if}

					{#if weaviateRes?.candidates?.length}
						<div class="block">
							<div class="block-title">Candidates</div>
							<div class="cards">
								{#each weaviateRes.candidates.slice(0, 10) as c (c.profile_url)}
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
			<div class="foot-left">Influencer Scout</div>
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

	.logo {
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 0.9rem;
		display: grid;
		place-items: center;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: #fffaf4;
		background: linear-gradient(135deg, color-mix(in oklab, var(--accent) 70%, #fff7ee), color-mix(in oklab, var(--accent2) 85%, black));
		box-shadow: 0 14px 45px color-mix(in oklab, var(--accent2) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--accent2) 22%, transparent);
	}

	.title {
		font-weight: 720;
		letter-spacing: -0.02em;
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
		max-width: 44ch;
		line-height: 1.35;
		margin: 0 0 1.1rem;
	}

	.hero-ctas {
		display: flex;
		gap: 0.65rem;
		flex-wrap: wrap;
		margin-bottom: 1.2rem;
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

	.cta.ghost {
		background: transparent;
		color: var(--ink);
		border: 1px solid color-mix(in oklab, var(--ink) 14%, transparent);
		box-shadow: none;
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

	.tabs {
		display: flex;
		gap: 0.5rem;
	}

	.tab {
		border: 1px solid color-mix(in oklab, var(--ink) 14%, transparent);
		background: transparent;
		color: var(--ink);
		padding: 0.5rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
		font-weight: 650;
	}

	.tab.active {
		border-color: color-mix(in oklab, var(--accent) 35%, transparent);
		background: color-mix(in oklab, var(--accent) 14%, transparent);
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

	.controls {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.field {
		display: grid;
		gap: 0.35rem;
	}

	label {
		color: var(--muted2);
		font-size: 0.82rem;
	}

	input,
	select,
	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.65rem 0.75rem;
		border-radius: 0.9rem;
		border: 1px solid color-mix(in oklab, var(--ink) 12%, transparent);
		background: color-mix(in oklab, white 92%, var(--paper));
		color: var(--ink);
		outline: none;
	}

	textarea {
		resize: vertical;
		min-height: 5.5rem;
	}

	input:focus,
	select:focus,
	textarea:focus {
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

	.status {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.8rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
		background: color-mix(in oklab, white 88%, var(--paper));
	}

	.status-left {
		display: grid;
		gap: 0.35rem;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.6rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--accent) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--accent) 22%, transparent);
		width: fit-content;
	}

	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: var(--ok);
		box-shadow: 0 0 0 6px color-mix(in oklab, var(--ok) 15%, transparent);
	}

	.status-meta {
		color: var(--muted2);
		font-size: 0.88rem;
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.ghost-btn {
		border: 1px solid color-mix(in oklab, var(--ink) 14%, transparent);
		background: transparent;
		color: var(--ink);
		padding: 0.55rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
	}

	.ghost-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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

	.events {
		margin: 0;
		padding: 0.75rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
		background: color-mix(in oklab, white 92%, var(--paper));
		color: color-mix(in oklab, var(--ink) 88%, transparent);
		max-height: 12rem;
		overflow: auto;
		font-size: 0.83rem;
		line-height: 1.35;
		white-space: pre-wrap;
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
		.logo-strip {
			justify-content: center;
		}
		.controls {
			grid-template-columns: 1fr;
		}
		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
