'use client';

import Link from 'next/link';
import { EyeOff, Info, Play, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './personalized-recommendations.module.css';

type Card = {
  id: string;
  mediaType: 'movie' | 'series';
  title: string;
  seriesTitle: string | null;
  seriesDisplayTitle: string | null;
  seriesMetadataProviderId: string | null;
  summary: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  reason: string;
};

type RecommendationResponse = {
  personalized: boolean;
  hero: Card | null;
  sections: Array<{ id: string; title: string; items: Card[] }>;
};

export function PersonalizedRecommendations() {
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api<RecommendationResponse>('/media/recommendations'));
    } catch {
      setError('Anbefalingerne kunne ikke hentes lige nu. Dit bibliotek virker stadig.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function feedback(mediaId: string, type: 'like' | 'dislike' | 'hidden') {
    await api(`/media/${mediaId}/recommendation-feedback`, {
      method: 'PUT',
      body: JSON.stringify({ type }),
    });
    if (type === 'hidden') {
      setData((current) => current ? {
        ...current,
        hero: current.hero?.id === mediaId ? null : current.hero,
        sections: current.sections.map((section) => ({
          ...section,
          items: section.items.filter((item) => item.id !== mediaId),
        })),
      } : current);
    }
  }

  if (error) return <section className={styles.errorState}><strong>Personlige anbefalinger holder en kort pause</strong><p>{error}</p><button onClick={() => void load()}>Prøv igen</button></section>;
  if (!data) return <section className={styles.loading} aria-label="Henter personlige anbefalinger"><i /><div><i /><i /><i /></div></section>;
  const controls = (item: Card) => (
    <>
      <button aria-label={`Synes godt om ${item.title}`} onClick={() => void feedback(item.id, 'like')}><ThumbsUp size={15} /></button>
      <button aria-label={`Synes ikke om ${item.title}`} onClick={() => void feedback(item.id, 'dislike')}><ThumbsDown size={15} /></button>
      <button aria-label={`Skjul ${item.title}`} onClick={() => void feedback(item.id, 'hidden')}><EyeOff size={15} /></button>
    </>
  );

  return (
    <section className={styles.personal}>
      {data.hero && (
        <article className={styles.hero} style={{ backgroundImage: recommendationImage(data.hero.backdropPath) ? `linear-gradient(90deg,rgba(5,8,10,.98) 4%,rgba(5,8,10,.68) 46%,rgba(5,8,10,.12)),linear-gradient(0deg,rgba(5,8,10,.86),transparent 55%),url("${recommendationImage(data.hero.backdropPath)}")` : undefined }}>
          <div>
            <span>{data.hero.reason}</span>
            <h1>{data.hero.title}</h1>
            <p>{data.hero.summary}</p>
            <div className={styles.actions}>
              <Link href={data.hero.mediaType === 'movie' ? `/watch?play=${data.hero.id}` : `/watch/title/${data.hero.id}`}><Play size={17} fill="currentColor" />Afspil</Link>
              <Link href={`/watch/title/${data.hero.id}`}><Info size={17} />Info</Link>
              {controls(data.hero)}
            </div>
          </div>
        </article>
      )}
      {data.sections.map((section) => (
        <section className={styles.row} key={section.id}>
          <h2>{section.title}</h2>
          <div data-horizontal-scroller>
            {section.items.map((item) => (
              <article className={styles.card} key={item.id}>
                <Link href={`/watch/title/${item.id}`}>
                  {recommendationPoster(item.posterPath) ? <img src={recommendationPoster(item.posterPath)!} alt="" /> : <div className={styles.placeholder} />}
                  <strong>{item.title}</strong><small>{item.reason}</small>
                </Link>
                <div className={styles.feedback}>{controls(item)}</div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function recommendationImage(path: string | null): string | null {
  if (!path) return null;
  if (/^https:\/\//i.test(path)) return path;
  return `https://image.tmdb.org/t/p/original${path}`;
}

function recommendationPoster(path: string | null): string | null {
  if (!path) return null;
  if (/^https:\/\//i.test(path)) return path;
  return `https://image.tmdb.org/t/p/w500${path}`;
}
