import type { CarouselPhoto } from '@/components/PhotoCarousel';

/**
 * Dev-only sample photos (kit and states gallery). Simple drawn stand-ins,
 * bundled so the kit works offline; blurhashes computed from the files.
 */
export const samplePhotos: CarouselPhoto[] = [
  {
    key: 'fridge',
    source: require('./photo1.jpg') as number,
    blurhash: 'LMOpPfxaDNs.-ojtxuj[DhaytmkC',
  },
  {
    key: 'desk',
    source: require('./photo2.jpg') as number,
    blurhash: 'L7BgYat60ikC_Lj[E3a#0gay-Sj@',
  },
  {
    key: 'books',
    source: require('./photo3.jpg') as number,
    blurhash: 'LMPZMqxa_3xu~qj[RPj[-=j[9FWV',
  },
  {
    key: 'monitor',
    source: require('./photo4.jpg') as number,
    blurhash: 'LA6uVFkCQ*jZx_j[V=f6MHaytofl',
  },
];

/** `.test` never resolves, so this always shows the failed-photo placeholder. */
export const brokenPhotoUrl = 'https://media.invalid.test/missing.jpg';
