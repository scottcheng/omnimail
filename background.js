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
var recipients = {};

// use a timer to make sure we don't query for contacts too often
var timer = setTimeout();
var current_text, current_suggest;

var max_results = 5;
var delay = 500;

var logout = { content: "logout", description: chrome.i18n.getMessage("logout") };

chrome.omnibox.onInputChanged.addListener(function(text, suggest)
{
	// if there's no query or it's just one letter, and we are authed, do nothing
	if (text.trim().length <= 1 && oauth.hasToken())
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
	// form a request
	var endpoint = "http://www.google.com/m8/feeds/contacts/default/full"
	var request = {
		parameters:
		{
			alt: "json",
			"max-results": max_results,
			q: current_text,
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
			
			// loop through all matched contacts
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
					recipients[email] = contact.name;
					suggests.push({ content: email, description: "<url>" + email + "</url> " + chrome.i18n.getMessage("email_to", contact.name) });
				}
			}
			
			// include the logout command in the suggests
			suggests.push(logout);

			current_suggest(suggests);
		}, request);
	});
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
		var recipient = text;
		// if the recipient has a name, include it in the recipient box
		if (recipients[text])
		{
			recipient = '"' + recipients[text] + '" <' + text + ">";
		}
		// open GMail to write the email
		chrome.tabs.create({ url: "https://mail.google.com/mail/?ui=1&view=cm&fs=1&to=" + encodeURIComponent(recipient) });
	}
});
