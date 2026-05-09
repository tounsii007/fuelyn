// ============================================================
// Fuelyn — German Translations
// ============================================================

export const de = {
  common: {
    loading: 'Laden...',
    error: 'Fehler',
    retry: 'Erneut versuchen',
    cancel: 'Abbrechen',
    save: 'Speichern',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    close: 'Schließen',
    back: 'Zurück',
    next: 'Weiter',
    done: 'Fertig',
    search: 'Suchen',
    filter: 'Filter',
    sort: 'Sortieren',
    settings: 'Einstellungen',
    noResults: 'Keine Ergebnisse',
    offline: 'Keine Internetverbindung',
    km: 'km',
    min: 'Min.',
    liter: 'Liter',
    perLiter: '€/L',
    refresh: 'Aktualisieren',
  },

  nav: {
    map: 'Karte',
    list: 'Liste',
    settings: 'Einstellungen',
    favorites: 'Favoriten',
    vehicle: 'Fahrzeug',
    more: 'Mehr',
  },

  map: {
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    location: 'Standort',
    stations: 'Tankstellen',
    distance: 'Entfernung',
    myLocation: 'Mein Standort',
    centerOnLocation: 'Auf Standort zentrieren',
  },

  prices: {
    price: 'Preis',
    cheapest: 'Günstigster',
    mostExpensive: 'Teuerster',
    average: 'Durchschnitt',
    trend: 'Preistrend',
    lastUpdate: 'Letzte Aktualisierung',
  },

  fuel: {
    diesel: 'Diesel',
    e5: 'Super E5',
    e10: 'Super E10',
    selectType: 'Kraftstoffart wählen',
    all: 'Alle',
  },

  station: {
    stations: 'Tankstellen',
    nearby: 'Tankstellen in der Nähe',
    detail: 'Tankstellendetails',
    price: 'Preis',
    distance: 'Entfernung',
    driveTime: 'Fahrzeit',
    open: 'Geöffnet',
    closed: 'Geschlossen',
    openingTimes: 'Öffnungszeiten',
    allDay: 'Durchgehend geöffnet',
    navigate: 'Navigation starten',
    directions: 'Route',
    addFavorite: 'Als Favorit speichern',
    removeFavorite: 'Favorit entfernen',
    bestOption: 'Beste Option',
    recommended: 'Empfohlen',
    noPrice: 'Kein Preis verfügbar',
    priceUpdated: 'Preis aktualisiert',
  },

  reachability: {
    safe: 'Sicher erreichbar',
    tight: 'Knapp erreichbar',
    unreachable: 'Nicht erreichbar',
    withCurrentFuel: 'mit aktuellem Kraftstoff',
    fuelCostToReach: 'Geschätzte Fahrtkosten',
  },

  recommendation: {
    cheapest: 'Günstigster Preis',
    veryCheap: 'Sehr günstiger Preis',
    veryClose: 'Sehr nah',
    nearby: 'In der Nähe',
    currentlyOpen: 'Aktuell geöffnet',
    favorite: 'Favorit',
    whyRecommended: 'Warum empfohlen?',
  },

  sort: {
    cheapest: 'Günstigste',
    nearest: 'Nächste',
    recommended: 'Empfohlen',
    open: 'Geöffnet',
  },

  filter: {
    fuelType: 'Kraftstoff',
    radius: 'Umkreis',
    onlyOpen: 'Nur geöffnete',
    brands: 'Marken',
    priceRange: 'Preisbereich',
    resetFilters: 'Filter zurücksetzen',
  },

  vehicle: {
    title: 'Fahrzeugdaten',
    name: 'Fahrzeugname',
    namePlaceholder: 'z. B. Mein Golf',
    fuelType: 'Kraftstoffart',
    consumption: 'Durchschnittsverbrauch',
    consumptionUnit: 'L/100 km',
    consumptionPlaceholder: 'z. B. 6.5',
    tankCapacity: 'Tankgröße',
    tankCapacityUnit: 'Liter',
    tankCapacityPlaceholder: 'z. B. 50',
    tankCapacityOptional: 'optional',
    currentRange: 'Verbleibende Reichweite',
    currentRangeUnit: 'km',
    currentFuelLevel: 'Aktueller Tankstand',
    fuelLevelPercent: 'Prozent',
    fuelLevelLiters: 'Liter',
    fuelLevelKm: 'Reichweite (km)',
    saveVehicle: 'Fahrzeug speichern',
    noVehicle: 'Kein Fahrzeug hinterlegt',
    addVehicle: 'Fahrzeug hinzufügen',
    editVehicle: 'Fahrzeug bearbeiten',
  },

  favorites: {
    title: 'Favoriten',
    empty: 'Noch keine Favoriten gespeichert.',
    emptyHint: 'Tippe auf das Herz-Symbol bei einer Tankstelle, um sie als Favorit zu speichern.',
  },

  settings: {
    title: 'Einstellungen',
    theme: 'Erscheinungsbild',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    themeSystem: 'System',
    language: 'Sprache',
    languageDe: 'Deutsch',
    languageEn: 'English (UK)',
    languageEnUs: 'English (US)',
    languageFr: 'Français',
    defaultRadius: 'Standard-Suchradius',
    defaultFuelType: 'Standard-Kraftstoff',
    mapStyle: 'Kartenstil',
    mapStandard: 'Standard',
    mapSatellite: 'Satellit',
    mapTerrain: 'Gelände',
    mapDark: 'Dunkel',
    searchRadius: 'Suchradius',
    searchRadiusUnit: 'km',
    notifications: 'Benachrichtigungen',
    notificationsDesc: 'Preisalarme und Updates verwalten',
    priceAlert: 'Preisalarm',
    data: 'Daten',
    clearCache: 'Cache löschen',
    clearCacheDesc: 'Gespeicherte Daten und Cache löschen',
    cacheCleared: 'Cache wurde gelöscht',
    lastUpdate: 'Letzte Aktualisierung',
    never: 'Nie',
    about: 'Über Fuelyn',
    privacy: 'Datenschutz',
    imprint: 'Impressum',
    github: 'GitHub',
    version: 'Version',
    appDescription: 'Preisdaten bereitgestellt von Tankerkönig (MTS-K / Bundeskartellamt).',
  },

  location: {
    permissionTitle: 'Standortzugriff',
    permissionMessage: 'Fuelyn nutzt deinen Standort, um Tankstellen in deiner Nähe zu finden.',
    permissionDenied: 'Standortzugriff verweigert',
    permissionDeniedHint: 'Bitte erlaube den Standortzugriff in den Einstellungen oder suche manuell nach einem Ort.',
    searchPlaceholder: 'Ort, PLZ oder Stadt eingeben...',
    useCurrentLocation: 'Aktuellen Standort verwenden',
    locating: 'Standort wird ermittelt...',
  },

  onboarding: {
    welcome: 'Willkommen bei Fuelyn',
    subtitle: 'Finde die beste Tankstelle — nicht nur die billigste.',
    fuelQuestion: 'Was tankst du?',
    fuelSelect: 'Wähle deinen Standard-Kraftstoff',
    howItWorks: 'So funktioniert\'s',
    tipMapTitle: 'Karte & Liste',
    tipMapText: 'Wechsle zwischen Karten- und Listenansicht',
    tipStarTitle: 'Beste Empfehlung',
    tipStarText: 'Der Stern zeigt dir die sinnvollste Tankstelle',
    tipVehicleTitle: 'Fahrzeugprofil',
    tipVehicleText: 'Hinterlege dein Auto für Reichweiten-Checks',
    step1Title: 'Standort teilen',
    step1Text: 'Wir zeigen dir Tankstellen in deiner Nähe.',
    step2Title: 'Fahrzeug eintragen',
    step2Text: 'Optional: Gib deinen Verbrauch ein für intelligente Empfehlungen.',
    step3Title: 'Clever tanken',
    step3Text: 'Wir berücksichtigen Preis, Entfernung und deine Reichweite.',
    skip: 'Überspringen',
    getStarted: 'Los geht\'s',
    continue: 'Weiter',
  },

  offline: {
    banner: 'Offline — Daten werden aus dem Cache geladen',
    backOnline: 'Wieder online',
    cachedData: 'Gespeicherte Daten werden angezeigt',
    syncPending: 'Aktualisierung ausstehend',
  },

  error: {
    genericTitle: 'Etwas ist schiefgelaufen',
    genericMessage: 'Bitte versuche es erneut.',
    networkTitle: 'Keine Verbindung',
    networkMessage: 'Bitte überprüfe deine Internetverbindung.',
    apiTitle: 'Daten konnten nicht geladen werden',
    apiMessage: 'Die Preisdaten sind momentan nicht verfügbar.',
    locationTitle: 'Standort nicht verfügbar',
    locationMessage: 'Bitte erlaube den Standortzugriff oder suche manuell.',
  },

  // ─── New keys covering the iter-1..28 UI additions ──────────
  // These exist here so the EN/FR locales can provide their own
  // translations now and the components can migrate from
  // hardcoded German to t() calls incrementally — without
  // breaking compile when a component referenced a missing key.

  panel: {
    travel: 'Anfahrt',
    withYourVehicle: 'Mit deinem Fahrzeug',
    fullTank: 'Volltanken',
    fuelCostRoundTrip: 'Sprit-Aufwand Hin+Rück',
    fullRange: 'Reichweite voll',
    bestChoice: 'BESTE WAHL',
    cheapestChip: 'günstigster',
    belowAvg: 'ct unter Schnitt',
    aboveAvg: 'ct über Schnitt',
    routeDetail: 'Route',
    savingsVsAvg: 'ct/L vs. Schnitt',
  },

  compare: {
    trayLabel: 'zum Vergleich gewählt',
    cta: 'Vergleichen',
    clearAll: 'Vergleich leeren',
    addedHint: 'Zum Vergleich hinzufügen',
    removeHint: 'Aus Vergleich entfernen',
    full: 'Vergleich voll (3/3)',
  },

  liveGps: {
    sectionTitle: 'Privatsphäre & Standort',
    toggleTitle: 'Live-Standort verfolgen',
    toggleDesc:
      'Aktualisiert deine Position automatisch während du dich bewegst, ' +
      'damit Entfernungen und Reihenfolge sich anpassen. Schluckt mehr ' +
      'Akku — daher standardmäßig aus.',
    permission: 'Berechtigung',
    permissionGranted: 'Erteilt',
    permissionDenied: 'Verweigert',
    permissionPrompt: 'Ausstehend',
    trackingLabel: 'Tracking',
    trackingActive: 'Live aktiv',
    trackingInactive: 'Inaktiv',
    accuracyLabel: 'Genauigkeit',
    forgetLocation: 'Gespeicherten Standort vergessen',
    forgetLocationDesc:
      'Setzt deine Position zurück. Beim nächsten Öffnen wird sie neu ermittelt.',
  },

  bestDeal: {
    eyebrow: 'Top Deal',
    live: 'Live',
    indexLabel: 'Live-Preisindex',
    perFillSavings: 'Spar bis zu',
    perFillUnit: 'pro Tankfüllung',
    marketAvgTooltip: 'Markt-Durchschnitt',
    bestPriceTooltip: 'Bester Preis',
  },

  routePlanner: {
    summary: 'Routen-Übersicht',
    distance: 'Strecke',
    duration: 'Fahrzeit',
    fuelCost: 'Sprit-Kosten',
    estimatedWith: 'Geschätzt mit',
    cheapestStop: 'günstigster Stopp',
    openInMaps: 'In Google Maps öffnen',
    moveUp: 'Nach oben',
    moveDown: 'Nach unten',
    removeStop: 'Stopp entfernen',
    cheapStations: 'Günstige Tankstellen',
    yourRoute: 'Deine Route',
    noStops: 'Keine Stopps geplant.',
    locationRequired: 'Standort benötigt',
    locationRequiredHint:
      'Aktiviere den Standort auf der Hauptseite, um den Routenplaner zu nutzen.',
  },

  fuelLog: {
    monthlyOverview: 'Monatsübersicht',
    lastNMonths: 'letzte {n} Monate',
    currentMonth: 'aktuell',
    cheapestMonth: '★ günstigster',
    entriesPlural: 'Einträge',
    entriesSingular: 'Eintrag',
  },

  alerts: {
    armedShort: 'aktiv',
    pausedShort: 'pausiert',
    bulkActivate: 'Alle aktivieren',
    bulkPause: 'Alle pausieren',
    bulkActivateTitle: 'Alle Alarme aktivieren',
    bulkPauseTitle: 'Alle Alarme vorübergehend pausieren',
  },

  shortcuts: {
    title: 'Tastenkürzel',
    cmdK: 'Befehlspalette öffnen',
    esc: 'Dialoge & Popups schließen',
    arrowKeys: 'In Listen navigieren',
    enter: 'Auswahl bestätigen',
    pinDrop: 'Pin auf Karte setzen',
  },

  pinDrop: {
    toast: 'Suchzentrum gesetzt',
  },
} as const;

// Recursively widen literal strings so other locales can provide their own values
type DeepStringify<T> = T extends string ? string : { [K in keyof T]: DeepStringify<T[K]> };
export type TranslationKeys = DeepStringify<typeof de>;
