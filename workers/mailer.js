module.exports = (jwt, ejs, mailgun) => {
  const Mailer = {
    send: (email, subject, header, content, ctaText, ctaUrl, tags) => {
      let unsubscribeToken = jwt.sign({ email: email }, process.env.JWT_SECRET);

      var mailContent = {
        title: subject,
        header: header,
        content: content,
        ctaText: ctaText,
        ctaUrl: ctaUrl,
        unsubscribeUrl: `${process.env.BASE_URL}/unsubscribe/${unsubscribeToken}`,
        baseUrl: process.env.BASE_URL,
        address_line_1: process.env.ADDRESS_LINE_1,
        address_line_2: process.env.ADDRESS_LINE_2,
        address_line_3: process.env.ADDRESS_LINE_3,
        address_line_4: process.env.ADDRESS_LINE_4,
        address_line_5: process.env.ADDRESS_LINE_5
      };

      ejs.renderFile('./views/email-template.html', mailContent, function (err, str) {
        let data = {
          from: '🧻🔥 Toilettenpapieralarm.de <alarm@toilettenpapieralarm.de>',
          to: email,
          subject: subject,
          html: str,
          "o:tag" : tags
        };
        mailgun.messages().send(data, function (error, body) {
          console.log(`Message with subject "${subject}" to ${data.to} sent.`);
        });
      });
    }
  }

  return Mailer;
} 