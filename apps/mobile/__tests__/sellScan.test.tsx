import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { createDraftStore } from '../src/features/sell/draft';
import {
  bookFromOpenLibrary,
  bookListingTitle,
  isbnFromBarcode,
  lookupIsbn,
  TEXTBOOKS_CATEGORY,
} from '../src/features/sell/isbn';
import { emptyDraft, TITLE_MAX } from '../src/features/sell/logic';
import { SellScanScreen } from '../src/features/sell/SellScanScreen';
import { primer, sell } from '../src/strings/en';

const mockCamera = { status: 'granted', canAskAgain: true };
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(async () => mockCamera),
  requestCameraPermissionsAsync: jest.fn(async () => mockCamera),
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  return { CameraView: (props: object) => <View {...props} /> };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const NOW = new Date('2027-03-10T12:00:00');
// Stewart, Calculus: Early Transcendentals (valid ISBN-13 checksum).
const ISBN = '9781285741550';

describe('T-UNIT-ISBN-01 barcode to ISBN', () => {
  it('accepts book EAN-13 codes with a valid checksum', () => {
    expect(isbnFromBarcode(ISBN)).toBe(ISBN);
    expect(isbnFromBarcode('978-1-285-74155-0')).toBe(ISBN);
    expect(isbnFromBarcode('9790000000001')).toBe('9790000000001');
  });
  it('rejects other products, bad checksums and short codes', () => {
    expect(isbnFromBarcode('0012345678905')).toBeNull();
    expect(isbnFromBarcode('9781285741551')).toBeNull();
    expect(isbnFromBarcode('978128574155')).toBeNull();
    expect(isbnFromBarcode('')).toBeNull();
  });
});

describe('T-UNIT-ISBN-02 Open Library answer', () => {
  const answer = {
    [`ISBN:${ISBN}`]: {
      title: ' Calculus: Early Transcendentals ',
      authors: [{ name: 'James Stewart' }, { name: '' }, {}],
      publish_date: 'January 2015',
    },
  };
  it('reads title, authors and year', () => {
    expect(bookFromOpenLibrary(ISBN, answer)).toEqual({
      title: 'Calculus: Early Transcendentals',
      authors: ['James Stewart'],
      year: '2015',
    });
  });
  it('is null when the book is unknown or has no title', () => {
    expect(bookFromOpenLibrary(ISBN, {})).toBeNull();
    expect(bookFromOpenLibrary(ISBN, null)).toBeNull();
    expect(bookFromOpenLibrary(ISBN, { [`ISBN:${ISBN}`]: { title: ' ' } })).toBeNull();
  });
  it('builds a listing title with the author surname, within the limit', () => {
    expect(bookListingTitle({ title: 'Calculus', authors: ['James Stewart'], year: null })).toBe(
      'Calculus, Stewart',
    );
    expect(bookListingTitle({ title: 'Calculus', authors: [], year: null })).toBe('Calculus');
    const long = 'A'.repeat(TITLE_MAX - 3);
    expect(bookListingTitle({ title: long, authors: ['Ann Smith'], year: null })).toBe(long);
    expect(
      bookListingTitle({ title: 'B'.repeat(TITLE_MAX + 20), authors: [], year: null }),
    ).toHaveLength(TITLE_MAX);
  });
  it('looks up only the ISBN and throws on a server error', async () => {
    const ok = jest.fn(async (_url: string) => ({ ok: true, json: async () => answer }));
    await expect(lookupIsbn(ISBN, ok as unknown as typeof fetch)).resolves.toMatchObject({
      title: 'Calculus: Early Transcendentals',
    });
    expect(ok.mock.calls[0]?.[0]).toBe(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${ISBN}&format=json&jscmd=data`,
    );
    const bad = jest.fn(async () => ({ ok: false, status: 503 }));
    await expect(lookupIsbn(ISBN, bad as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe('T-UNIT-ISBN-03 scan screen', () => {
  const storeNow = () => {
    const store = createDraftStore(
      { get: () => null, set: () => {}, remove: () => {} },
      { now: () => NOW },
    );
    store.getState().update({ ...emptyDraft(NOW), title: '' });
    return store;
  };

  const renderScan = (lookup: jest.Mock) => {
    const store = storeNow();
    renderRouter(
      {
        'sell/details': () => <Text testID="screen-details">details</Text>,
        'sell/scan': () => <SellScanScreen store={store} lookup={lookup} />,
      },
      { initialUrl: '/sell/details' },
    );
    return store;
  };

  const openScan = async () => {
    const { router } = jest.requireActual('expo-router');
    act(() => router.push('/sell/scan'));
    return screen.findByTestId('sell-scan-camera');
  };

  beforeEach(() => {
    mockCamera.status = 'granted';
    mockCamera.canAskAgain = true;
  });

  it('fills the title and Textbooks, then goes back to details', async () => {
    const lookup = jest.fn(async () => ({
      title: 'Calculus',
      authors: ['James Stewart'],
      year: '2015',
    }));
    const store = renderScan(lookup);
    const camera = await openScan();
    fireEvent(camera, 'barcodeScanned', { data: ISBN, type: 'ean13' });
    // The camera keeps reporting the code; only one lookup happens.
    fireEvent(camera, 'barcodeScanned', { data: ISBN, type: 'ean13' });
    await screen.findByTestId('screen-details');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(ISBN);
    expect(store.getState().draft.title).toBe('Calculus, Stewart');
    expect(store.getState().draft.categoryId).toBe(TEXTBOOKS_CATEGORY);
  });

  it('says when a barcode is not a book, and scans again', async () => {
    const lookup = jest.fn();
    renderScan(lookup);
    const camera = await openScan();
    fireEvent(camera, 'barcodeScanned', { data: '0012345678905', type: 'ean13' });
    expect(await screen.findByText(sell.scanNotBook)).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('sell-scan-again'));
    expect(await screen.findByTestId('sell-scan-hint')).toBeTruthy();
  });

  it('offers typing the title when the book is unknown or the lookup fails', async () => {
    const lookup = jest.fn(async () => null);
    const store = renderScan(lookup);
    const camera = await openScan();
    fireEvent(camera, 'barcodeScanned', { data: ISBN, type: 'ean13' });
    expect(await screen.findByTestId('sell-scan-notFound')).toBeTruthy();
    expect(store.getState().draft.title).toBe('');
    fireEvent.press(screen.getByTestId('sell-scan-type'));
    await screen.findByTestId('screen-details');
  });

  it('shows a problem, not a crash, when the lookup throws', async () => {
    const lookup = jest.fn(async () => {
      throw new Error('network');
    });
    renderScan(lookup);
    const camera = await openScan();
    fireEvent(camera, 'barcodeScanned', { data: ISBN, type: 'ean13' });
    expect(await screen.findByTestId('sell-scan-notFound')).toBeTruthy();
  });

  it('shows Open Settings when the camera is turned off', async () => {
    mockCamera.status = 'denied';
    mockCamera.canAskAgain = false;
    renderScan(jest.fn());
    const { router } = jest.requireActual('expo-router');
    act(() => router.push('/sell/scan'));
    expect(await screen.findByText(primer.openSettings)).toBeTruthy();
    expect(screen.queryByTestId('sell-scan-camera')).toBeNull();
  });
});
