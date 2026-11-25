import type { Config } from "./types";

export function defaultConfig(): Config {
  return {
    households: [
      {
        id: "sean-lauren",
        name: "Sean & Lauren",
        tag: "Grandparents",
        isGrandparents: true,
        adults: [
          { id: "sean", name: "Sean" },
          { id: "lauren", name: "Lauren" },
        ],
        kids: [],
      },
      {
        id: "aj-elena",
        name: "AJ & Elena",
        adults: [
          { id: "aj", name: "AJ" },
          { id: "elena", name: "Elena" },
        ],
        kids: [
          { id: "mae", name: "Mae", optedOut: false },
          { id: "sawyer", name: "Sawyer", optedOut: false },
          { id: "salem", name: "Salem", optedOut: false },
          { id: "river", name: "River", optedOut: true },
        ],
      },
      {
        id: "spencer-mandy",
        name: "Spencer & Mandy",
        adults: [
          { id: "spencer", name: "Spencer" },
          { id: "mandy", name: "Mandy" },
        ],
        kids: [],
      },
      {
        id: "maxwell-megan",
        name: "Maxwell & Megan",
        adults: [
          { id: "maxwell", name: "Maxwell" },
          { id: "megan", name: "Megan" },
        ],
        kids: [
          { id: "ellie", name: "Ellie", optedOut: false },
          { id: "parker", name: "Parker", optedOut: false },
          { id: "shepherd", name: "Shepherd", optedOut: true },
        ],
      },
      {
        id: "seth-elizabeth",
        name: "Seth & Elizabeth",
        adults: [
          { id: "seth", name: "Seth" },
          { id: "elizabeth", name: "Elizabeth" },
        ],
        kids: [],
      },
    ],
    rules: { ownKids: true, noRepeat: true, grandparentsSkipKids: false },
    budgets: { adult: "", kid: "" },
    exchangeDate: "",
  };
}
