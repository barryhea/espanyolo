-- "Mal" should only mean "Bad" (was "Badly")
UPDATE words SET english = 'Bad' WHERE spanish = 'Mal' AND theme = 'Core Grammar';
