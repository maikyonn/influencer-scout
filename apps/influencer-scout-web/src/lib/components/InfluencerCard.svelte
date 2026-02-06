<script lang="ts">
	import { animate, remove } from 'animejs';
	import { onMount } from 'svelte';
	import { fmtInt } from '$lib/utils/format';
	import type { InfluencerProfile } from '$lib/types';

	let { profile }: { profile: InfluencerProfile } = $props();
	let el: HTMLAnchorElement | null = $state(null);

	const url = $derived(String(profile.profile_url || profile.url || '').trim());
	const name = $derived(String(profile.display_name || '').trim() || 'Creator');
	const platform = $derived(String(profile.platform || '').trim() || '—');
	const fit = $derived(profile.fit_score == null ? null : Number(profile.fit_score));

	onMount(() => {
		if (!el) return;
		remove(el);
		animate(el, {
			opacity: [0, 1],
			translateY: [10, 0],
			duration: 450,
			easing: 'easeOutCubic'
		});
	});
</script>

<a class="card" href={url || '#'} target="_blank" rel="noreferrer" bind:this={el}>
	<div class="top">
		<div class="name">{name}</div>
		<div class="pill">{platform}</div>
	</div>

	<div class="stats">
		<div class="stat">
			<div class="label">Followers</div>
			<div class="value">{fmtInt(profile.followers)}</div>
		</div>
		<div class="stat">
			<div class="label">Fit</div>
			<div class="value">{fit == null ? '—' : String(fit)}</div>
		</div>
	</div>

	{#if profile.fit_summary}
		<div class="summary">{profile.fit_summary}</div>
	{/if}
</a>

<style>
	.card {
		display: grid;
		gap: 0.75rem;
		padding: 0.95rem;
		border-radius: 1rem;
		background: color-mix(in oklab, white 72%, var(--paper));
		border: 1px solid color-mix(in oklab, var(--ink) 12%, transparent);
		box-shadow:
			0 10px 40px color-mix(in oklab, var(--ink) 7%, transparent),
			inset 0 1px 0 rgba(255, 255, 255, 0.7);
		text-decoration: none;
		color: inherit;
		transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
	}

	.card:hover {
		transform: translateY(-2px);
		border-color: color-mix(in oklab, var(--accent) 35%, transparent);
		box-shadow:
			0 16px 55px color-mix(in oklab, var(--accent) 10%, transparent),
			0 8px 30px color-mix(in oklab, var(--ink) 9%, transparent);
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}

	.name {
		font-weight: 650;
		letter-spacing: -0.01em;
		line-height: 1.1;
	}

	.pill {
		font-size: 0.78rem;
		padding: 0.25rem 0.55rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--accent) 16%, transparent);
		color: color-mix(in oklab, var(--accent2) 82%, var(--ink));
		border: 1px solid color-mix(in oklab, var(--accent) 28%, transparent);
		white-space: nowrap;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.stat {
		padding: 0.55rem 0.65rem;
		border-radius: 0.9rem;
		background: color-mix(in oklab, var(--paper) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
	}

	.label {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.value {
		font-variant-numeric: tabular-nums;
		font-size: 1rem;
		font-weight: 650;
	}

	.summary {
		color: color-mix(in oklab, var(--ink) 75%, transparent);
		font-size: 0.9rem;
		line-height: 1.35;
	}
</style>
