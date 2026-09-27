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

export const photo = {
  count: '{index} / {count}',
  failed: "Photo didn't load",
  openHint: 'Opens the photo full screen',
} as const;

/** Global screen states (DESIGN_SYSTEM §10): loading, error, offline. */
export const states = {
  loading: 'Loading',
  errorTitle: "Couldn't load this",
  offlineTitle: "You're offline",
  offlineBody: 'Check your connection and try again.',
  retry: 'Try again',
} as const;

export const nav = {
  back: 'Back',
  close: 'Close',
  tabWithBadge: '{label}, {count} new',
  step: 'Step {step} of {total}',
} as const;

/** Permission primers (P2-CMP-10, board X18, X21, A12). Buttons say Continue, not Allow. */
export const primer = {
  openSettings: 'Open Settings',
  camera: {
    title: 'Take photos of your stuff',
    body: 'OnlySwap uses the camera only when you add photos to a listing or your profile. Nothing is recorded in the background.',
    cta: 'Continue',
    alternative: 'Choose from library instead',
    deniedTitle: 'Camera is turned off',
    deniedBody: 'To take pictures, allow OnlySwap to use the Camera in Settings.',
  },
  photos: {
    title: 'Add photos from your library',
    body: 'OnlySwap only sees the photos you pick. You can choose just the ones you want to share.',
    cta: 'Continue',
    alternative: 'Use the camera instead',
    deniedTitle: 'Photos are turned off',
    deniedBody:
      'To add pictures, allow OnlySwap to use Photos in Settings. You can pick just the ones you want to share.',
  },
  notifications: {
    title: "Don't miss an offer",
    body: 'Most things sell within a few hours. We only notify you about offers, messages and stuff you saved.',
    cta: 'Turn on notifications',
    alternative: 'Not now',
    deniedTitle: 'Notifications are off',
    deniedBody:
      'To hear about offers and messages, turn on notifications for OnlySwap in Settings.',
  },
} as const;

/** Report sheet (P2-CMP-11, board B9, E19). Reason keys match DATA_MODEL reports.reason. */
export const report = {
  titleListing: 'Report this listing',
  titleMessage: 'Report this message',
  titlePerson: 'Report {name}',
  them: 'They',
  seller: 'The seller',
  private: "Reports are private. {name} won't know it was you.",
  reasonLabel: 'Reason',
  reasons: {
    listing: {
      scam: 'Looks like a scam',
      not_allowed: "It's not allowed (vapes, alcohol, weapons and more)",
      stolen: 'Might be stolen',
      counterfeit: 'Fake or counterfeit',
      misleading: 'Wrong photos or misleading',
      harassment: 'Harassment',
      threat: 'Threats or feeling unsafe',
      hate: 'Hate or slurs',
      sexual: 'Sexual content',
      no_show: "Didn't show up",
      other: 'Something else',
    },
    person: {
      scam: 'Scam or fake payment',
      not_allowed: "Selling something that's not allowed",
      stolen: 'Selling something stolen',
      counterfeit: 'Selling fakes',
      misleading: 'Misleading about an item',
      harassment: 'Harassment or unwanted messages',
      threat: 'Threats or feeling unsafe',
      hate: 'Hate or slurs',
      sexual: 'Sexual content',
      no_show: "Didn't show up",
      other: 'Something else',
    },
  },
  detailsLabel: 'Add details (optional)',
  detailsPlaceholderListing: 'Example: my bike was stolen from outside the library last week',
  detailsPlaceholderPerson: 'Example: kept messaging me after I said no',
  alsoBlock: 'Also block {name}',
  blockHint: "They can't message you, make offers or see your listings.",
  send: 'Send report',
  sentTitle: 'Report sent',
  sentBody: "Thanks for telling us. We'll look into it, usually within a day.",
  sentBodyBlocked:
    "Thanks for telling us. You blocked {name}, and we'll look into it, usually within a day.",
  duplicateTitle: 'Already reported',
  duplicateBody: "You've already reported this. We're on it.",
  done: 'Done',
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

/** Dev-build-only kit additions for S6 (P2-KIT-01). Sample copy, not shipped UI. */
export const kit2 = {
  accent: 'Accent preview',
  photos: 'Photos',
  photoAlt: 'Mini fridge, 3.1 cubic feet',
  photoLoading: 'Loading',
  photoLoaded: 'Loaded',
  photoError: 'Failed',
  states: 'Empty, error and loading',
  emptyTitle: 'Nothing listed yet',
  emptyBody: 'Listing takes about a minute. Things that sell fastest here:',
  emptyAction: 'List your first thing',
  sugBooks: 'Textbooks',
  sugFridge: 'Mini fridges',
  sugChair: 'Desk chairs',
  sugLamp: 'Lamps',
  sugFree: 'Free stuff',
  navigation: 'Navigation',
  newListing: 'New listing',
  stepCount: '1 of 3',
  offer: 'Offer',
  more: 'More options',
  tabIos: 'Tab bar, iOS',
  tabAndroid: 'Tab bar, Android (board N1)',
  nextStep: 'Next step',
  uploading: 'Uploading photo 2',
  addProgress: 'Add progress',
  primers: 'Permission primers',
  primerKind: 'Permission',
  camera: 'Camera',
  photosKind: 'Photos',
  notifications: 'Notifications',
  showPrimer: 'Show primer',
  showDenied: 'Show denied',
  dialogs: 'Dialogs and reports',
  openConfirm: 'Delete a listing',
  reportListing: 'Report a listing',
  reportPerson: 'Report a person',
  confirmTitle: 'Delete this listing?',
  confirmBody: 'It stops showing to buyers. Chats about it stay so nobody loses a deal.',
  confirmAction: 'Delete listing',
  deleted: 'Listing deleted',
  personName: 'Ben O.',
  openStates: 'Open states gallery',
} as const;

/** Dev-build-only states gallery (P2-KIT-02): fixture copy for every board X frame. */
export const statesFx = {
  title: 'States gallery',
  intro: 'Every X frame from the design board, rendered with S6 components and fixtures.',
  release: 'Release {release}',
  realScreen: 'Real screen: {screen}',
  notInR10: 'Not in R1.0',
  pendingTitle: 'Built in a later session',
  pendingBody:
    'This state belongs to {screen}. It gets its real fixture when that screen is built ({task}).',
  removedBody: 'Removed from R1.0 ({reason}). Kept here so every board frame stays reachable.',
  laterBody: 'Planned for release {release}. Kept here so every board frame stays reachable.',
  emailLabel: 'School email',
  emailPlaceholder: 'you@school.edu',
  sendCode: 'Send code',
  loginTitle: 'Welcome back',
  loginBody: "Enter your school email and we'll send a code. No password to remember.",
  codeTitle: 'Enter the code',
  codeWrong: "That code isn't right. 2 tries left.",
  cachedRow: 'Dell 24 inch monitor',
  cachedValue: '$50',
  noResultsTitle: 'No standing desks under $30',
  noResultsBody: '3 show up if you remove the price filter.',
  noResultsAction: 'Show 3 results over $30',
  noResultsSave: "Tell me when one's listed",
  inboxTitle: 'No offers yet',
  inboxBody:
    'Offers you make and offers on your stuff show up here. Chats open once an offer is accepted.',
  startSwiping: 'Start swiping',
  sessionTitle: "Quick check it's you",
  sessionBody: "It's been a while. We sent a code to your school email.",
  continue: 'Continue',
  logOut: 'Log out instead',
  reverifyTitle: 'Still a student here?',
  reverifyBody: 'Once a year we check that everyone is a current student. It takes 20 seconds.',
  remindLater: 'Remind me next week',
  pausedTitle: 'Your account is paused',
  pausedBody:
    'A listing broke the banned items rule. You can still read and finish chats you already had open.',
  appeal: 'Appeal this',
  readRules: 'Read the rules',
  appealTitle: 'What happened?',
  appealMistake: 'This was a mistake',
  appealUnaware: "I didn't know the rule",
  appealSomeoneElse: 'Someone else used my account',
  appealDetails: 'Tell us your side',
  sendAppeal: 'Send appeal',
  updateTitle: 'Time to update',
  updateBody: "This version can't send offers anymore. The update keeps everything you had.",
  updateAction: 'Update OnlySwap',
  maintenanceTitle: 'Back in about 15 minutes',
  maintenanceBody:
    "We're upgrading things behind the scenes. Nothing you've listed or saved is affected.",
  goneTitle: 'This one sold',
  goneBody: 'Your offers were closed automatically. Similar things are still up.',
  goneAction: 'See similar',
  reviewBanner: 'Your calculator listing is being reviewed. Most reviews take under 2 hours.',
  reviewRow: 'Calculator and notes',
  reviewTag: 'In review',
  draftTitle: 'Pick up where you left off?',
  draftBody: 'You started listing a monitor yesterday.',
  startOver: 'Start over',
  uploadRetry: 'Upload failed. Tap to retry.',
  blockedBanner: "You blocked Ben. He can't message you or see your listings.",
  unblock: 'Unblock',
  undoSkipped: 'Skipped Mini fridge',
  showUndo: 'Show the undo toast',
  otherCampusTitle: 'This listing is at another campus',
  otherCampusBody: 'Only students there can see it. Here is what is close on your campus.',
  otherCampusAction: 'Browse similar',
  signedOutTitle: 'Sign in to see it',
  signedOutBody: 'Listings are only visible to verified students. It takes 30 seconds.',
  largeTextBody:
    'Set the largest text size in Settings, then check this list: names wrap and buttons grow.',
  notificationsTitle: 'All quiet',
  notificationsBody: 'Offers, messages, price drops and meetup reminders will show up here.',
  notificationSettings: 'Notification settings',
  savedTitle: 'No saved items',
  savedBody:
    "Tap the bookmark on any card to save it. You'll hear about price drops and when it sells.",
  bannedRows: {
    alcohol: 'Alcohol, vapes, nicotine and weed',
    drugs: 'Medication and drugs',
    weapons: 'Weapons',
    fakes: 'Fakes and IDs',
  },
} as const;

/** Launch and Welcome (A01, A02). */
export const launch = {
  label: 'OnlySwap is starting',
} as const;

export const welcome = {
  wordmark: 'onlyswap',
  title: 'Buy and sell with students at your school.',
  body: 'Dorm stuff, textbooks, tech. Meet between classes and pay in person.',
  continue: 'Continue with school email',
  signIn: 'I already have an account',
  signInHint: 'Signs in with the code we email to your school address',
  /** Floating sample listings on the hero photo (decorative, hidden from screen readers). */
  samples: [
    { title: 'Mini fridge', price: '$40', place: 'North dorms' },
    { title: 'Chem textbooks', price: '$25', place: 'Main library' },
    { title: '27 inch monitor', price: '$90', place: 'East hall' },
  ],
} as const;

export const en = {
  permissions,
  tabs,
  shell,
  errors,
  sheet,
  toast,
  banner,
  photo,
  states,
  nav,
  primer,
  report,
  dev,
  kit,
  kit2,
  statesFx,
  launch,
  welcome,
} as const;

export default en;
