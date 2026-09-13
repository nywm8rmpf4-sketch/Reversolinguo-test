import { FormattedMessage } from 'react-intl'

export function PrivacyNotice() {
  return (
    <details className="privacy">
      <summary><FormattedMessage id="privacyDetails" /></summary>
      <p><FormattedMessage id="privacyP1" /></p>
      <p><FormattedMessage id="privacyP2" /></p>
      <p><FormattedMessage id="privacyP3" /></p>
      <p><FormattedMessage id="privacyP4" /></p>
    </details>
  )
}
