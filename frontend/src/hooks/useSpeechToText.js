import { useState, useEffect, useRef, useCallback } from 'react';

export function useSpeechToText({ onTranscript, onError } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const shouldRestartRef = useRef(false);

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  const isSupported = Boolean(SpeechRecognition);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // Ignore errors when stopping already stopped instance
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      onError?.('Speech recognition is not supported in this browser.');
      return;
    }

    // If already running, stop first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (err) {
        // ignore
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
        shouldRestartRef.current = true;
      };

      recognition.onresult = (event) => {
        let interim = '';
        let finalized = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalized += transcript;
          } else {
            interim += transcript;
          }
        }

        if (finalized) {
          onTranscript?.(finalized);
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          // Normal timeout when silence; keep listening if user intended
          return;
        }

        if (event.error === 'not-allowed') {
          shouldRestartRef.current = false;
          setIsListening(false);
          isListeningRef.current = false;
          onError?.('Microphone access was denied. Please allow microphone permissions.');
          return;
        }

        if (event.error === 'network') {
          onError?.('Network error occurred during speech recognition.');
        } else {
          onError?.(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setInterimTranscript('');
        // Chrome stops recognition after brief silence even with continuous = true.
        // Auto-restart if user still wants to be listening.
        if (shouldRestartRef.current && isListeningRef.current) {
          try {
            recognition.start();
          } catch (err) {
            setIsListening(false);
            isListeningRef.current = false;
          }
        } else {
          setIsListening(false);
          isListeningRef.current = false;
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
      isListeningRef.current = false;
      onError?.('Failed to start speech recognition.');
    }
  }, [SpeechRecognition, isSupported, onTranscript, onError]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (err) {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    toggleListening,
  };
}
