export const CONTACT_EMAIL = 's.mounier.contact@gmail.com'

// The terms page: what the site does, ads, refunds, data and how to reach us.
export default function Terms() {
  return (
    <main className="terms">
      <a className="terms-back" href="/">
        ← Back to the LARP meter
      </a>
      <h1>Terms, refunds & privacy</h1>
      <p className="kicker">Last updated October 8, 2026</p>

      <h2>What sharp-or-larp is</h2>
      <p>
        sharp-or-larp gives a light-hearted opinion on a public GitHub profile or a CV: a "larp"
        percentage, red and green flags, and a one-line roast. The verdict is generated
        automatically by code and an AI model. It is entertainment, not a factual assessment of
        anyone's skills, and should not be used to make hiring decisions.
      </p>

      <h2>Ads</h2>
      <p>
        An ad costs $10 USD and is shown for 7 days on the side of the site and in the scrolling
        strips on phones. It is published automatically right after payment and shows your name,
        a short headline, a link to your LinkedIn profile, and the score from your check. The
        score comes from the check you ran and cannot be edited.
      </p>
      <p>
        Ads must link to your own LinkedIn profile and must not be offensive, misleading or
        illegal. We remove ads that break these rules.
      </p>

      <h2>Refunds</h2>
      <p>
        If every ad spot was taken by the time your payment went through, your ad can't be
        published and you are refunded automatically and in full. Once an ad is live it has been
        delivered, so it is not refunded. If something went wrong with your ad, write to us
        within 7 days and we will sort it out.
      </p>

      <h2>Payments</h2>
      <p>
        Payments are handled by Stripe. We never see or store your card details.
      </p>

      <h2>Your data</h2>
      <p>
        A CV is read in your browser; its text and links are sent to our server and to an AI
        model provider to produce the verdict, then discarded. For each check we keep the GitHub
        username and the score, so an ad can show it. For ads we keep the name, headline,
        LinkedIn link and score while the ad runs. We use no tracking cookies.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, refunds or removal requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </main>
  )
}
