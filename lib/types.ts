export type Person = { id: string; name: string };
export type Kid = Person & { optedOut: boolean };

export type Household = {
  id: string;
  name: string;
  tag?: string;
  /** The grandparent household is the one the "sit out the kid draw" rule applies to. */
  isGrandparents?: boolean;
  adults: Person[];
  kids: Kid[];
};

export type Rules = {
  /** Parents don't draw their own kids. */
  ownKids: boolean;
  /** No repeat of last year's match (adults, and household -> kid). */
  noRepeat: boolean;
  /** The grandparent household sits out the kid draw. */
  grandparentsSkipKids: boolean;
};

export type Config = {
  households: Household[];
  rules: Rules;
  budgets: { adult: string; kid: string };
  exchangeDate: string;
};

/** One row of the sealed list, and of history. */
export type Assignment = {
  giverId: string;
  adultRecipientId: string;
  kidRecipientIds: string[];
};

export type DrawMeta = {
  drawnAt: string;
  sealBroken: boolean;
  sealBrokenAt: string | null;
};

export type TokenRow = { personId: string; token: string };

export type LinkRecord = {
  year: number;
  personId: string;
  adultRecipientId: string;
  kidRecipientIds: string[];
  openedAt: string | null;
};

export type WishItem = { id: string; text: string; url?: string };

export type KidNotes = { text: string; updatedAt: string };

export type ReadyStatus = {
  adultCount: number;
  kidCount: number;
  giverCount: number;
  ok: boolean;
  /** "ok": every couple draws one kid; "info": some take two / sit out; "error": can't draw. */
  level: "ok" | "info" | "error";
  message: string;
};
