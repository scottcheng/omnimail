/*
 * background.js
 * OmniMail background script
 *
 * Copyright (C) 2011 Håvard Pettersson.
 *
 * OmniMail for GMail™ by Håvard Pettersson is licensed under a Creative
 * Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License. See
 * http://creativecommons.org/licenses/by-nc-sa/3.0/ for more information.
 */

// initialize oauth
var oauth = ChromeExOAuth.initBackgroundPage({
	'request_url': 'https://www.google.com/accounts/OAuthGetRequestToken',
	'authorize_url': 'https://www.google.com/accounts/OAuthAuthorizeToken',
	'access_url': 'https://www.google.com/accounts/OAuthGetAccessToken',
	'consumer_key': 'anonymous',
	'consumer_secret': 'anonymous',
	'scope': 'http://www.google.com/m8/feeds/',
	'app_name': 'OmniMail'
});

// map emails to names
var names = {};

// use a timer to make sure we don't query for contacts too often
var timer = setTimeout();
var current_text, current_suggest;

// sloppily checking for emails
var email = /.+@.+/

var max_results = 5;
var delay = 500;

var logout = { content: "logout", description: chrome.i18n.getMessage("logout") };

chrome.omnibox.onInputChanged.addListener(function(text, suggest)
{
	// if there's no query or it's just one letter, and we are authed, do nothing
	if (split_query(text).query.length <= 1 && oauth.hasToken())
	{
		suggest([logout]);
		return;
	}

	// refresh the request timer to make sure we only poll for contacts every <delay> milliseconds
	clearTimeout(timer);
	timer = setTimeout(get_contacts, delay);

	// store the current text and suggest callbacks for when get_contacts is called
	current_text = text;
	current_suggest = suggest;
});

function get_contacts()
{
	// separate preceding emails from the current search
	var query = split_query(current_text);
	var query_emails = query.emails;
	query = query.query;

	// form a request
	var endpoint = "http://www.google.com/m8/feeds/contacts/default/full"
	var request = {
		parameters:
		{
			alt: "json",
			"max-results": max_results,
			q: query,
		},
		headers:
		{
			"GData-Version": "3.0",
		}
	};

	// authorize if we aren't already
	oauth.authorize(function()
	{
		oauth.sendSignedRequest(endpoint, function(text, xhr)
		{
			var suggests = [];
			var contacts = [];
			var data = JSON.parse(text);
			
			// loop through all matched contacts. Can throw an exception, but 
			// it's not critical, so we don't bother catching it.
			for (var i = 0, entry; entry = data.feed.entry[i]; i++)
			{
				var contact = {
					name: entry.title.$t,
					emails: []
				};

				if (entry.gd$email)
				{
					// a contact can have multiple emails, store them in the contact object
					var emails = entry.gd$email;
					for (var j = 0, email; email = emails[j]; j++)
					{
						contact.emails.push(email.address);
					}
				}

				if (!contact.name)
				{
					contact.name = contact.emails[0] || "<Unknown>";
				}
				
				contacts.push(contact);
			}

			// loop all contacts and their emails, adding them to the suggests object
			for (var i = 0, contact; contact = contacts[i]; i++)
			{
				for (var j = 0, email; email = contact.emails[j]; j++)
				{
					names[email] = contact.name;
					var content = query_emails.slice(0);
					content.push(email);
					suggests.push({
						content: content.join(" "), 
						description: "<url>" + email + "</url> " + (query_emails.length == 0 ? chrome.i18n.getMessage("email_to", contact.name) : chrome.i18n.getMessage("email_to_and_other" + (query_emails.length > 1 ? "s" : ""), [contact.name, query_emails.length]))
					});
				}
			}
			
			// include the logout command in the suggests
			suggests.push(logout);

			current_suggest(suggests);
		}, request);
	});
}

function split_query(query)
{
	var split = query.split(" ");
	for (var i = 0; email.test(split[i]); i++) {}
	return { emails: split.splice(0, i), query: split.join(" ") };
}

chrome.omnibox.onInputEntered.addListener(function(text)
{
	text = text.trim();
	if (text == "logout")
	{
		oauth.clearTokens();
	}
	else
	{
		var recipients = text.split(" ");
		// if the recipient has a name, include it in the recipient box
		for (var i = 0, recipient; recipient = recipients[i]; i++)
		{
			if (names[recipient])
			{
				recipients[i] = '"' + names[recipient] + '" <' + recipient + ">";
			}
		}
		// open GMail to write the email
		chrome.tabs.create({ url: "https://mail.google.com/mail/?ui=1&view=cm&fs=1&to=" + encodeURIComponent(recipients.join(", ")) });
	}
});
