<script lang="ts">
	import { animate, stagger, remove } from 'animejs';
	import { onMount, tick } from 'svelte';
	import type { WaterfallTimingArtifact } from '$lib/types';

	type Row = {
		key: string;
		label: string;
		leftPct: number;
		widthPct: number;
		durationText: string;
	};

	const labels: Record<string, string> = {
		query_expansion: 'Query Expansion',
		weaviate_search: 'Weaviate Search',
		brightdata_collection: 'BrightData',
		llm_analysis: 'LLM Analysis'
	};

	const order = ['query_expansion', 'weaviate_search', 'brightdata_collection', 'llm_analysis'];

	let { timing }: { timing: WaterfallTimingArtifact | null } = $props();
	let rows = $derived(calcRows(timing));

	function calcRows(t: WaterfallTimingArtifact | null): Row[] {
		if (!t || !t.stages) return [];
		const startAbs = Number(t.pipeline_start || 0);
		const endAbs = Number(t.pipeline_end || 0) || Date.now() / 1000;
		const total = Math.max(0.001, endAbs - startAbs);

		const out: Row[] = [];
		for (const key of order) {
			const st = t.stages[key];
			if (!st) continue;
			const s = Number(st.start || 0);
			const e = st.end != null ? Number(st.end) : Math.max(s, endAbs - startAbs);
			const leftPct = Math.max(0, Math.min(100, (s / total) * 100));
			const widthPct = Math.max(0.5, Math.min(100 - leftPct, ((e - s) / total) * 100));
			const duration = st.duration != null ? `${Number(st.duration).toFixed(2)}s` : '—';

			out.push({
				key,
				label: labels[key] || key,
				leftPct,
				widthPct,
				durationText: duration
			});
		}
		return out;
	}

	async function animateBars() {
		// Wait for DOM to reflect current rows
		await tick();
		const bars = document.querySelectorAll<HTMLElement>('[data-wf-bar]');
		remove(bars);
		animate(bars, {
			opacity: [0.6, 1],
			scaleX: [0.98, 1],
			duration: 550,
			easing: 'easeOutQuad',
			delay: stagger(50)
		});
	}

	onMount(animateBars);
	$effect(() => {
		rows;
		void animateBars();
	});
</script>

{#if rows.length === 0}
	<div class="wf-empty">No timing yet.</div>
{:else}
	<div class="wf">
		{#each rows as r (r.key)}
			<div class="wf-row">
				<div class="wf-label">{r.label}</div>
				<div class="wf-track">
					<div
						class="wf-bar"
						data-wf-bar
						style={`left:${r.leftPct.toFixed(3)}%;width:${r.widthPct.toFixed(3)}%`}
					></div>
				</div>
				<div class="wf-meta">{r.durationText}</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.wf {
		display: grid;
		gap: 0.6rem;
	}

	.wf-row {
		display: grid;
		grid-template-columns: 10rem 1fr 4rem;
		align-items: center;
		gap: 0.8rem;
	}

	.wf-label {
		font-size: 0.85rem;
		letter-spacing: 0.01em;
		color: var(--muted);
	}

	.wf-track {
		position: relative;
		height: 0.8rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--ink) 10%, transparent);
		overflow: hidden;
	}

	.wf-bar {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 999px;
		background: linear-gradient(90deg, var(--accent), var(--accent2));
		box-shadow: 0 10px 30px color-mix(in oklab, var(--accent) 25%, transparent);
		transform-origin: 50% 50%;
	}

	.wf-meta {
		font-variant-numeric: tabular-nums;
		font-size: 0.85rem;
		color: var(--muted);
		text-align: right;
	}

	.wf-empty {
		color: var(--muted);
		font-size: 0.9rem;
	}

	@media (max-width: 720px) {
		.wf-row {
			grid-template-columns: 1fr;
			gap: 0.4rem;
		}
		.wf-meta {
			text-align: left;
		}
	}
</style>
