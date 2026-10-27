# Beta feedback form (copy into Google Forms / Tally / Typeform)

Create a form with these questions. After you publish, copy the form link and either:

1. Set env var on Netlify: `VITE_FEEDBACK_URL` = your form URL, then redeploy, **or**
2. Temporarily hardcode the URL in `LandingPage` usage in `App.tsx`.

## Questions

1. **Email** (short answer, optional) — so we can follow up  
2. **How did you hear about this beta?** (short answer)  
3. **What kind of file did you try?** (multiple choice, pick all that apply)  
   - Qualtrics export  
   - Google Forms  
   - Excel / CSV from another tool  
   - Sample / fixture only  
   - Did not import a file  
4. **How far did you get?** (multiple choice)  
   - Opened the app only  
   - Created a project  
   - Imported data  
   - Set up scales / response maps  
   - Ran scoring  
   - Exported a file  
5. **Did scoring match what you expected?** (multiple choice)  
   - Yes  
   - Mostly  
   - No  
   - Did not score  
6. **What broke or confused you?** (paragraph)  
7. **What do you still do in Excel / SPSS / R after using this?** (paragraph)  
8. **Would you use this again on a real project?** (multiple choice: Yes / Maybe / No)  
9. **Anything else?** (paragraph)

## Invite email template

Subject: Beta invite — Psychometric Prep (browser scale scoring)

Body:

Hi,

I'm testing a small tool that scores survey/scale exports in the browser (subscales, reverse items, word scales, export). Data stays on your device — nothing is uploaded to a server.

App: [YOUR_NETLIFY_URL]
Feedback form: [YOUR_FORM_URL]

A real Qualtrics or Forms file is ideal if you have one. Reply or use the form if something breaks.

Thanks
