# Brew day

The brew-day mode guides you through a batch, from weighing out to pitching the yeast. It is made for a phone or tablet next to the kettle: full screen, big buttons, and the screen stays on.

## Start

1. Open a recipe and tap **Brew this**. Choose the equipment you brew on: the recipe is scaled to its batch size and efficiency. This creates a batch, which is a copy of the recipe. Changes to the batch don't touch the recipe.
2. On the batch, tap **Start brew day**. It opens full screen:
   - The screen stays on, as long as your browser supports it and the page is served over HTTPS or localhost.
   - Allow notifications when asked, and tap the bell in the header to turn on sound.

## Steps

The steps come from the batch:

| Step | What you do |
|---|---|
| Weigh out | Tick off each ingredient and the water. |
| Heat strike water | Heat the shown volume to the shown temperature. |
| Mash in | Add the grain and any mash additions. You can enter the mash pH here. |
| Mash rests | One timer per rest. |
| Sparge / lauter | Includes the first-wort hops. |
| Before the boil | Enter the gravity and the hot volume. You get your efficiency and, if you're off target, a correction: add water, boil longer, or add dry malt extract. |
| Boil | One timer. Each addition counts down to its time, turns red and pulses when due, and sounds an alert. |
| Whirlpool | Only if the recipe has whirlpool additions. |
| Chill, measure OG, pitch | Measuring the OG gives your efficiency and a correction tip. |
| Finish | The batch moves to **fermenting**, fermentation day 0 starts, and the OG becomes the first reading. |

## Timers and several devices

Timers run on the server's clock. Locking the phone, reloading, or opening the brew day on a second device (a phone at the kettle and a tablet in the kitchen) shows the same time everywhere. Ticking an item or moving to another step on one device also updates the others.

Alerts sound only while the brew day page is open; browsers don't let web pages run in the background. Even then, the timers stay correct, and missed additions are highlighted when you come back.

## After brew day

On the batch page (it opens on the tab for the batch's status, see [Batches](user-guide.md#batches)):

- **Brewing**: correct the values measured on brew day.
- **Fermentation**: the fermenter, the final gravity, and gravity and temperature readings with the curve, the attenuation and the ABV.
- **Conditioning**: keg or bottles, packaged volume and carbonation.
- **Overview**: planned versus actual values and the fermentation plan with dates (read only).
- **Planning**: how the batch differs from the recipe. **Save changes to recipe** or **Save as new recipe** copies the batch's version back.
- **Log**: notes and events.
