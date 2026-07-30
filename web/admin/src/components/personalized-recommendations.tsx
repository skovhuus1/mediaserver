'use client';

import Link from 'next/link';
import { EyeOff, Info, Play, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    api<RecommendationResponse>('/media/recommendations').then(setData).catch(() => undefined);
  }, []);

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

  if (!data) return null;
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
        <article className={styles.hero} style={{ backgroundImage: data.hero.backdropPath ? `linear-gradient(90deg,rgba(5,8,12,.97),rgba(5,8,12,.18)),url("${data.hero.backdropPath}")` : undefined }}>
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
                  {item.posterPath ? <img src={item.posterPath} alt="" /> : <div className={styles.placeholder} />}
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
