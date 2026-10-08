// src/components/ui/feedbackContext.js
import { createContext, useContext } from 'react';

export const FeedbackContext = createContext(null);

// toast(message, { tone: 'success' | 'error' | 'info' })
// confirm({ title, message, confirmLabel, cancelLabel, tone }) → Promise<boolean>
export const useFeedback = () => useContext(FeedbackContext);
