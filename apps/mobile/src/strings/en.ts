/**
 * All user-facing copy for the mobile app (CLAUDE.md rule 8).
 * Voice: plain student tone, no em dashes, no emoji, verbs on buttons.
 *
 * Native permission strings live in `permissions.json` because `app.config.ts`
 * runs in plain Node at prebuild time and can only read JSON or JS.
 */

import permissionsJson from './permissions.json';

export const permissions: Readonly<{ camera: string; photos: string }> = permissionsJson;

export const tabs = {
  discover: 'Discover',
  sell: 'Sell',
  inbox: 'Inbox',
  profile: 'Profile',
} as const;

export const shell = {
  discoverTitle: 'Discover',
  sellTitle: 'Sell',
  inboxTitle: 'Inbox',
  profileTitle: 'Profile',
  comingSoon: 'This screen is being built.',
} as const;

/** Error copy keyed by ErrorCode (API §0 + client codes). */
export const errors = {
  NOT_AUTHENTICATED: 'Sign in to keep going.',
  NOT_ACTIVE: "Your account can't do that right now. Check your profile for details.",
  AGE_REQUIRED: 'Confirm you are 18 or older to keep going.',
  RULES_REQUIRED: 'Read and accept the community rules to keep going.',
  FORBIDDEN: "You don't have access to that.",
  NOT_FOUND: "We couldn't find that. It may have been removed.",
  INVALID: 'Something in the form needs a fix. Check the highlighted fields.',
  BANNED_TERM: "That text includes words that aren't allowed on OnlySwap.",
  RATE_LIMITED: "You're doing that a lot. Try again in a little while.",
  RATE_LIMITED_UNTIL: "You're doing that a lot. Try again after {time}.",
  OFFERS_PAUSED: 'Offers are paused on your account after a missed meetup.',
  LISTING_UNAVAILABLE: "This item isn't taking offers right now.",
  OFFER_NOT_PENDING: 'This offer changed. Pull to refresh.',
  ALREADY_REPORTED: "You've already reported this. We're on it.",
  ALREADY_APPEALED: "You've already sent an appeal. We'll get back to you.",
  MEETUP_WINDOW: "That can't be done at this point in the meetup.",
  CHAT_CLOSED: 'This chat is closed.',
  CHAT_BLOCKED: "You can't send messages in this chat.",
  NOT_ADMIN: 'Admins only.',
  SCHOOL_UNKNOWN: "We don't support that school email yet.",
  DOMAIN_BLOCKED: "That email domain can't be used. Use your school email.",
  AGE_BLOCKED: 'OnlySwap is for people 18 and older.',
  BANNED: 'This account has been removed from OnlySwap.',
  FEATURE_OFF: "That isn't available yet.",
  ERR_OFFLINE: "You're offline. Check your connection and try again.",
  SESSION_EXPIRED: 'Your session ended. Sign in again.',
  UNKNOWN: 'Something went wrong. Try again.',
} as const;

export const sheet = {
  close: 'Close',
  cancel: 'Cancel',
} as const;

export const toast = {
  undo: 'Undo',
} as const;

export const banner = {
  offline: "You're offline. Some things won't update until you reconnect.",
} as const;

/** Dev-build-only spike screen (P1-SPIKE-03/04). Not shown in store builds. */
export const dev = {
  open: 'Open developer spikes',
  openHint: 'Opens the dev-only test screen',
  title: 'Developer spikes',
  mmkvLabel: 'MMKV counter (survives a reload)',
  mmkvButton: 'Add one',
  mmkvHint: 'Adds one to the saved counter',
  unistylesLabel: 'Unistyles theme',
  unistylesButton: 'Switch theme',
  unistylesHint: 'Switches between light and dark',
  ageLabel: 'OS age signal',
  ageButton: 'Ask for age range',
  ageHint: 'Asks the system for your age range',
  ageNotAsked: 'Not asked yet',
  ageUnknown: 'Unknown',
  keyboardLabel: 'Keyboard avoiding field',
  keyboardHint: 'Type to check the field stays above the keyboard',
  keyboardPlaceholder: 'Type here',
  themeLabel: 'Appearance',
  themeHint: 'Changes light or dark mode right away',
  themeModes: { system: 'System', light: 'Light', dark: 'Dark' },
  typeLabel: 'Type scale',
  typeSample: 'Swap a desk lamp for a bike light',
  typePrice: '$1,234.50',
  typeOverlay: 'Photo overlay text stops growing at 1.4x',
  motionFull: 'Motion: full',
  motionReduced: 'Motion: reduced (fades only)',
  motionButton: 'Show success',
  motionHint: 'Plays or clears the success check',
  motionDone: 'Done',
} as const;

/** Dev-build-only component kit (P2-KIT-01). Sample copy, not shipped UI. */
export const kit = {
  open: 'Open component kit',
  title: 'Component kit',
  buttons: 'Buttons',
  primary: 'Post item',
  dark: 'Make an offer',
  secondary: 'Save for later',
  text: 'Not now',
  destructive: 'Delete listing',
  loading: 'Sending',
  disabled: 'Unavailable',
  iconBack: 'Back',
  iconShare: 'Share',
  iconMore: 'More options',
  inputs: 'Inputs',
  email: 'School email',
  emailPlaceholder: 'you@school.edu',
  price: 'Price',
  search: 'Search listings',
  searchPlaceholder: 'Search',
  name: 'First name',
  nameError: 'Use letters only.',
  disabledField: 'Campus',
  description: 'Description',
  code: 'Verification code',
  codeError: 'Show code error',
  controls: 'Controls',
  categories: 'Categories',
  catBooks: 'Books',
  catTech: 'Tech',
  catDorm: 'Dorm',
  catFree: 'Free',
  condition: 'Condition',
  condNew: 'New',
  condGood: 'Good',
  condFair: 'Fair',
  removable: 'Under $20',
  remove: 'remove filter',
  alerts: 'Price drop alerts',
  alertsHint: 'Get a push when a saved item gets cheaper',
  pickup: 'Pickup only',
  meetup: 'Meet on campus',
  agree: 'I agree to the community rules',
  quantity: 'Quantity',
  decrease: 'Decrease',
  increase: 'Increase',
  overlays: 'Sheets and toasts',
  openSheet: 'Open sheet',
  openActions: 'Open actions',
  sheetTitle: 'Make an offer',
  sheetBody: 'Drag down, tap outside or use back to close. Type below to check the keyboard.',
  offerAmount: 'Your offer',
  actionsTitle: 'Listing',
  actionShare: 'Share listing',
  actionReport: 'Report listing',
  showToast: 'Show toast',
  toastMessage: 'Offer sent',
  showUndo: 'Show undo toast',
  undoMessage: 'Listing hidden',
  showError: 'Show error toast',
  errorMessage: "Couldn't send. Try again.",
  banners: 'Banners',
  bannerInfo: 'Finals week: meetups close at 9 PM.',
  bannerWarning: 'Your account needs a quick re-verify.',
  surfaces: 'Cards, rows and tags',
  cardTitle: 'Desk lamp',
  cardMeta: 'Posted 2 hours ago',
  tagNew: 'New',
  tagAccent: 'Founding seller',
  tagGreen: 'Verified',
  tagAmber: 'On hold',
  tagRed: 'Sold',
  settings: 'Account',
  rowEmail: 'Email',
  rowEmailValue: 'you@school.edu',
  rowNotifications: 'Notifications',
  rowDelete: 'Delete account',
  settingsFooter: 'Deleting removes your listings and chats.',
  avatarA: 'Maya Chen',
  avatarB: 'Jordan',
  avatarC: 'Sam Rivera',
} as const;

export const en = { permissions, tabs, shell, errors, sheet, toast, banner, dev, kit } as const;

export default en;
