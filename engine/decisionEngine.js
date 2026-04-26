function shouldTrade({ probability, agreementScore }) {
  return probability > 0.6 && agreementScore >= 2;
}

module.exports = { shouldTrade };