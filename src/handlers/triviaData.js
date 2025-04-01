// trivia.js

// trivia questions
const triviaData = [

  {
    category: 'miscellaneous',
    question: 'What is the capital of Japan?',
    answers: [
      'A. Tokyo',
      'B. Seoul',
      'C. Beijing',
      'D. Bangkok'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'Miscellaneous',
    question: 'Which athlete has won eight gold medals at a single Olympics?',
    answers: [
      'A. Vera Caslavska\n',
      'B. Michael Phelps\n',
      'C. Lloyd Spooner\n',
      'D. Agnes Keleti\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'What popular beverage once contained cocaine?',
    answers: [
      'A. Powerade\n',
      'B. Coca-Cola\n',
      'C. Schweppes\n',
      'D. Dr Pepper\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'Which is the largest food and drink company in the world?',
    answers: [
      'A. Kellogg Company\n',
      'B. Pepsi\n',
      'C. Nestlé\n',
      'D. Danone\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'Miscellaneous',
    question: 'In a game of bingo, which number is traditionally represented by the phrase “two little ducks”?',
    answers: [
      'A. 11\n',
      'B. 59\n',
      'C. 22\n',
      'D. 14\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'Miscellaneous',
    question: 'At the 1996 Summer Olympics, in what sport was the U.S. team nicknamed the “Magnificent 7”?',
    answers: [
      'A. Diving\n',
      'B. Gymnastics\n',
      'C. Swimming\n',
      'D. Track and Field\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'Which animal is, according to the New York Times, by far the most expensive animal to keep in a zoo?',
    answers: [
      'A. Hippo\n',
      'B. Toucan\n',
      'C. Elephant\n',
      'D. Giant panda\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'Miscellaneous',
    question: 'How many players are on the ice per team in an Ice Hockey game?',
    answers: [
      'A. 8\n',
      'B. 7\n',
      'C. 5\n',
      'D. 6\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: 'What is the alcoholic beverage ‘sake’ made of?',
    answers: [
      'A. Rice\n',
      'B. Wasabi\n',
      'C. Soybeans\n',
      'D. Seafood\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'Miscellaneous',
    question: 'Which is an Icelandic traditional dish?',
    answers: [
      'A. Rugbrød\n',
      'B. Lutefisk\n',
      'C. Sheep’s head\n',
      'D. Krebinetter\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'Miscellaneous',
    question: 'In 1989, NHL player Pelle Eklund scored the fastest goal in NHL playoff history. How long did it take?',
    answers: [
      'A. 22 Seconds\n',
      'B. 11 Seconds\n',
      'C. 31 Seconds\n',
      'D. 5 Seconds\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: 'First released in 1982, what actor’s workout videos gained worldwide popularity?',
    answers: [
      'A. Raquel Welch\n',
      'B. Jaqueline Smith\n',
      'C. Heather Locklear\n',
      'D. Jane Fonda\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: 'What Italian brand of handbags, footwear, accessories, … was founded in 1921 in Florence?',
    answers: [
      'A. Delpozo\n',
      'B. Dolce & Gabbana\n',
      'C. Hugo Boss\n',
      'D. Gucci\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: 'Which country does gouda cheese come from?',
    answers: [
      'A. Denmark\n',
      'B. Netherlands\n',
      'C. Switzerland\n',
      'D. Belgium\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'Which of these martial arts has its origins in China?',
    answers: [
      'A. Krav Maga\n',
      'B. Jujutsu\n',
      'C. Karate\n',
      'D. Kung fu\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: 'Worldwide, what is the third most popular drink?',
    answers: [
      'A. Tea\n',
      'B. Beer\n',
      'C. Water\n',
      'D. Coffee\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'Which company was the first to use Santa Claus in an ad?',
    answers: [
      'A. Walmart\n',
      'B. Target\n',
      'C. Pepsi\n',
      'D. Coca Cola\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: "Which planet is known as the 'Morning Star'?",
    answers: [
      'A. Mars\n',
      'B. Venus\n',
      'C. Jupiter\n',
      'D. Saturn\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'Who is the lead vocalist of the rock band Queen?',
    answers: [
      'A. Freddie Mercury\n',
      'B. John Deacon\n',
      'C. Brian May\n',
      'D. Roger Taylor\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'Miscellaneous',
    question: 'In Greek mythology, who was the king of the gods?',
    answers: [
      'A. Zeus\n',
      'B. Poseidon\n',
      'C. Hades\n',
      'D. Apollo\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'Miscellaneous',
    question: 'What is the chemical symbol for iron?',
    answers: [
      'A. Ir\n',
      'B. Fe\n',
      'C. In\n',
      'D. I\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'What is the largest ocean on Earth?',
    answers: [
      'A. Atlantic Ocean\n',
      'B. Indian Ocean\n',
      'C. Arctic Ocean\n',
      'D. Pacific Ocean\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: "Who painted the famous artwork 'The Starry Night'?",
    answers: [
      'A. Pablo Picasso\n',
      'B. Vincent van Gogh\n',
      'C. Claude Monet\n',
      'D. Salvador Dalí\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: 'What is the chemical symbol for sodium?',
    answers: [
      'A. Sa\n',
      'B. So\n',
      'C. Sn\n',
      'D. Na\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Miscellaneous',
    question: 'Which continent is the largest by land area?',
    answers: [
      'A. Africa\n',
      'B. Asia\n',
      'C. North America\n',
      'D. Europe\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Miscellaneous',
    question: "Who is known as the 'Father of Modern Physics'?",
    answers: [
      'A. Isaac Newton\n',
      'B. Albert Einstein\n',
      'C. Galileo Galilei\n',
      'D. Nikola Tesla\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'Miscellaneous',
    question: 'What is the main ingredient in hummus?',
    answers: [
      'A. Chickpeas\n',
      'B. Lentils\n',
      'C. Black beans\n',
      'D. Kidney beans\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'Miscellaneous',
    question: 'What is the chemical symbol for silver?',
    answers: [
      'A. Si\n',
      'B. Ag\n',
      'C. Au\n',
      'D. Hg\n'
    ],
    correctAnswer: 'B'
  },

  // SPORTS!!!

  {
    category: 'sports',
    question: 'Which country won the first ever FIFA World Cup in 1930?',
    answers: [
      'A. Uruguay\n',
      'B. Brazil\n',
      'C. Italy\n',
      'D. Germany\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'Who holds the record for the most Grand Slam singles titles in tennis?',
    answers: [
      'A. Roger Federer\n',
      'B. Rafael Nadal\n',
      'C. Novak Djokovic\n',
      'D. Serena Williams\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'sports',
    question: 'In which year did the modern Olympic Games resume after a hiatus during World War II?',
    answers: [
      'A. 1948\n',
      'B. 1952\n',
      'C. 1944\n',
      'D. 1940\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'Which NFL team has won the most Super Bowl titles?',
    answers: [
      'A. New England Patriots\n',
      'B. Pittsburgh Steelers\n',
      'C. San Francisco 49ers\n',
      'D. Dallas Cowboys\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'Who was the first athlete to run a mile in less than four minutes?',
    answers: [
      'A. Roger Bannister\n',
      'B. Steve Prefontaine\n',
      'C. Sebastian Coe\n',
      'D. Usain Bolt\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: "What sport does the term 'birdie' come from?",
    answers: [
      'A. Golf\n',
      'B. Badminton\n',
      'C. Tennis\n',
      'D. Cricket\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: "Who is the NBA's all-time leading scorer?",
    answers: [
      'A. Kareem Abdul-Jabbar\n',
      'B. LeBron James\n',
      'C. Michael Jordan\n',
      'D. Kobe Bryant\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'sports',
    question: 'In what year were the first modern Olympic Games held?',
    answers: [
      'A. 1896\n',
      'B. 1900\n',
      'C. 1904\n',
      'D. 1886\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'Which country has won the most Rugby World Cup titles?',
    answers: [
      'A. New Zealand\n',
      'B. Australia\n',
      'C. South Africa\n',
      'D. England\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'Who holds the record for the most career home runs in Major League Baseball?',
    answers: [
      'A. Barry Bonds\n',
      'B. Babe Ruth\n',
      'C. Hank Aaron\n',
      'D. Alex Rodriguez\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'What is the official national sport of Canada?',
    answers: [
      'A. Ice Hockey\n',
      'B. Lacrosse\n',
      'C. Curling\n',
      'D. Soccer\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'sports',
    question: 'Who is the only boxer to have won world titles in eight different weight divisions?',
    answers: [
      'A. Manny Pacquiao\n',
      'B. Floyd Mayweather Jr.\n',
      'C. Sugar Ray Leonard\n',
      'D. Muhammad Ali\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'Which Formula One driver holds the record for the most World Championships?',
    answers: [
      'A. Lewis Hamilton\n',
      'B. Max Verstappen\n',
      'C. Ayrton Senna\n',
      'D. Sebastian Vettel\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'What is the only country to have played in every single FIFA World Cup tournament?',
    answers: [
      'A. Brazil\n',
      'B. Germany\n',
      'C. Argentina\n',
      'D. Italy\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'What is the term for scoring three goals in a single game in ice hockey?',
    answers: [
      'A. Trifecta\n',
      'B. Triple play\n',
      'C. Three-pointer\n',
      'D. Hat trick\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'sports',
    question: 'Which city hosted the Summer Olympics in 2016?',
    answers: [
      'A. Rio de Janeiro\n',
      'B. London\n',
      'C. Beijing\n',
      'D. Sydney\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'What is the name of the trophy awarded to the winner of the NHL playoffs?',
    answers: [
      'A. Stanley Cup\n',
      'B. Lombardi Trophy\n',
      'C. Commissioner\'s Trophy\n',
      'D. Conn Smythe Trophy\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: "Who won the FIFA Women's World Cup in 2019?",
    answers: [
      'A. United States\n',
      'B. Netherlands\n',
      'C. Germany\n',
      'D. Sweden\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: "Which tennis player is known as the 'King of Clay'?",
    answers: [
      'A. Rafael Nadal\n',
      'B. Roger Federer\n',
      'C. Novak Djokovic\n',
      'D. Andy Murray\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'sports',
    question: 'Who is the only athlete to win Olympic gold medals in both the 100m and 200m sprints in three consecutive Olympic Games?',
    answers: [
      'A. Usain Bolt\n',
      'B. Carl Lewis\n',
      'C. Jesse Owens\n',
      'D. Michael Johnson\n'
    ],
    correctAnswer: 'A'
  },
  // Entertainment
  {
    category: 'entertainment',
    question: 'What was the original name of Mickey Mouse?',
    answers: [
      'A. The Rat\n',
      'B. Mortimer Mouse\n',
      'C. Marshall Mouse\n',
      'D. Marvin Mouse\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'entertainment',
    question: 'Which superhero, with the alter ego Wade Wilson and the powers of accelerated healing, was played by Ryan Reynolds in a 2016 film of the same name?',
    answers: [
      'A. Ant-Man\n',
      'B. Hawk\n',
      'C. Deadpool\n',
      'D. Black Panther\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: 'What is the next line for American Pie? Bye, bye Miss American Pie _________',
    answers: [
      'A. I am hitting the road\n',
      'B. Drove my Chevy to the levee\n',
      'C. Good Luck to you\n',
      'D. I don’t want to see you again\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'entertainment',
    question: 'Who was the first Disney character created by Walt Disney?',
    answers: [
      'A. Aladdin\n',
      'B. Mickey Mouse\n',
      'C. Sleeping Beauty\n',
      'D. Donald Duck\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'entertainment',
    question: 'Who sings Poker Face?',
    answers: [
      'A. Taylor Swift\n',
      'B. Kelly Clarkson\n',
      'C. Madonna\n',
      'D. Lady Gaga\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'entertainment',
    question: 'How would Groot answer this question?',
    answers: [
      'A. Groot I am young padawan\n',
      'B. YO homie whats up!\n',
      'C. I am Groot\n',
      'D. Mark is the bomb yo!\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: "What did Aladdin steal in the marketplace at the beginning of 'Aladdin'?",
    answers: [
      'A. Rice\n',
      'B. Gold\n',
      'C. Bread\n',
      'D. Apple\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: 'Stark Industries is associated with which fictional superhero?',
    answers: [
      'A. Hulk\n',
      'B. Iron Man\n',
      'C. Captain America\n',
      'D. Iron Fist\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'entertainment',
    question: 'In Zootopia, Officer Judy Hopps is what kind of animal?',
    answers: [
      'A. Deer\n',
      'B. Fox\n',
      'C. Kangaroo\n',
      'D. Rabbit\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'entertainment',
    question: 'Which superhero gains his transformation following accidental exposure to gamma rays during the detonation of an experimental bomb?',
    answers: [
      'A. The Human Flame\n',
      'B. Silver Surfer\n',
      'C. Hulk\n',
      'D. Iron Man\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: 'What are the names of Cinderella’s evil stepsisters?',
    answers: [
      'A. Gizelle and Anabelle\n',
      'B. Pam and Shirley\n',
      'C. Anastasia and Drizella\n',
      'D. Florence and Marge\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: 'Mary Jane Watson has been portrayed by which actress in three movies directed by Sam Raimi?',
    answers: [
      'A. Zendaya\n',
      'B. Shailene Woodley\n',
      'C. Kirsten Dunst\n',
      'D. Stephanie Tyler\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: 'Which College Is Elle Applying For In Legally Blonde?',
    answers: [
      'A. Duke\n',
      'B. Harvard\n',
      'C. Princeton\n',
      'D. Yale\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'entertainment',
    question: 'In Harry Potter, who is Fluffy?',
    answers: [
      'A. Harry’s Owl\n',
      'B. Hermione’s Cat\n',
      'C. Hagrid’s Dragon\n',
      'D. Hagrid’s 3 Headed Dog\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'entertainment',
    question: 'What’s the name of the sword in The Sword In The Stone?',
    answers: [
      'A. Nibue\n',
      'B. Excalibur\n',
      'C. Callandor\n',
      'D. Glamdring\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'entertainment',
    question: 'Which Museum Is Featured In Night at the Museum?',
    answers: [
      'A. The Smithsonian\n',
      'B. National Museum of the American Indian\n',
      'C. Museum of Natural History\n',
      'D. The Louvre\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: 'In the early days it was called ‘The DB’, but which fictional New York City tabloid newspaper often appears in the comic books published by Marvel Comics?',
    answers: [
      'A. The Times\n',
      'B. The Chronicle\n',
      'C. The Daily Bugle\n',
      'D. The Daily News\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'entertainment',
    question: 'Which superhero is commonly known as Logan and sometimes as Weapon X?',
    answers: [
      'A. Green Lantern\n',
      'B. Wolverine\n',
      'C. Silver Surfer\n',
      'D. Aquaman\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'entertainment',
    question: 'Which Magazine Does Miranda Work For In The Devil Wears Prada?',
    answers: [
      'A. The Thread\n',
      'B. Fashion Bash\n',
      'C. Upper Elite\n',
      'D. Runway\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'entertainment',
    question: "Who sings 'Blurred Lines'?",
    answers: [
      'A. Nick Cannon\n',
      'B. Pharrell Williams\n',
      'C. Pitbull\n',
      'D. Robin Thicke\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'entertainment',
    question: 'The Playstation game console was developed by which company?',
    answers: [
      'A. Capcom\n',
      'B. Nintendo\n',
      'C. Sega\n',
      'D. Sony\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'entertainment',
    question: 'Which part of his body did Charlie Chaplin insure?',
    answers: [
      'A. Face\n',
      'B. Moustache\n',
      'C. Hands\n',
      'D. Feet\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'entertainment',
    question: 'What is the license plate of the DeLorean in the Back to the Future films?',
    answers: [
      'A. 88timego\n',
      'B. Outatime\n',
      'C. 1Time\n',
      'D. GoFuture\n'
    ],
    correctAnswer: 'B'
  },

  // SCIENCE!

  {
    category: 'science',
    question: 'What is the name of the element with the chemical symbol ‘He’?',
    answers: [
      'A. Hafnium\n',
      'B. Hydrogen\n',
      'C. Helium\n',
      'D. Holmium\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'science',
    question: 'Which one of the following is the largest ocean in the world?',
    answers: [
      'A. Atlantic Ocean\n',
      'B. Indian Ocean\n',
      'C. Arctic Ocean\n',
      'D. Pacific Ocean\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'science',
    question: 'Which star is the brightest star in the night sky?',
    answers: [
      'A. None of these\n',
      'B. Arcturus\n',
      'C. Sirius A\n',
      'D. North Star\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'science',
    question: 'Sodium Hydrogen Bicarbonate is a scientific name of which common thing?',
    answers: [
      'A. Salt\n',
      'B. Baking Soda\n',
      'C. Cream or Tartar\n',
      'D. Carbonated Water\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'Name the bird in the following which has the largest wingspan?',
    answers: [
      'A. Emperor Penguin\n',
      'B. Emu\n',
      'C. Dalmatian Pelican\n',
      'D. Albatross bird\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'science',
    question: 'Which animal can be seen on the Porsche logo?',
    answers: [
      'A. Cougar\n',
      'B. Horse\n',
      'C. Cheetah\n',
      'D. Dog\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'What type of scientist studies living plants?',
    answers: [
      'A. Geologist\n',
      'B. Botanist\n',
      'C. Paleontologist\n',
      'D. Entomologist\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'Which of the following is NOT scientifically considered a fruit?',
    answers: [
      'A. Pumpkin\n',
      'B. Broccoli\n',
      'C. Pear\n',
      'D. Tomato\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'How is the Earth protected from the effects of Solar Winds from the Sun?',
    answers: [
      'A. The color of the sky\n',
      'B. Magnetic field\n',
      'C. Gravity\n',
      'D. Oxygen\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'All species of lemurs are native to which island country?',
    answers: [
      'A. Australia\n',
      'B. Madagascar\n',
      'C. Sri Lanka\n',
      'D. Indonesia\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'How many litres are there in a barrel of oil?',
    answers: [
      'A. 189\n',
      'B. 159\n',
      'C. 29\n',
      'D. 59\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'Which British archaeologist discovered Tutankhamun’s tomb?',
    answers: [
      'A. Ippolito Rosellini\n',
      'B. Thomas Young\n',
      'C. Karl Richard Lepsius\n',
      'D. Howard Carter\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'science',
    question: "A 'lepidopterist' is someone who studies which type of creature?",
    answers: [
      'A. Birds\n',
      'B. Butterflies\n',
      'C. Ants\n',
      'D. Fish\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'science',
    question: 'A lobsters teeth are located in which part of its body?',
    answers: [
      'A. Mouth\n',
      'B. Claws\n',
      'C. Stomach\n',
      'D. Legs\n'
    ],
    correctAnswer: 'C'
  },

  // HISTORY

  {
    category: 'history',
    question: 'Who was the second president of the USA?',
    answers: [
      'A. Thomas Jefferson\n',
      'B. John Quincy Adams\n',
      'C. Benjamin Franklin\n',
      'D. John Adams\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'history',
    question: 'Where is the Great Wall Located?',
    answers: [
      'A. Japan\n',
      'B. China\n',
      'C. South Korea\n',
      'D. North Korea\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'history',
    question: 'Mr. Pibb was a soft drink created by the Coca-Cola Company to compete with what other soft drink?',
    answers: [
      'A. Dr. Pepper\n',
      'B. Cherry Cola\n',
      'C. Root beer\n',
      'D. Mountain Dew\n'
    ],
    correctAnswer: 'A'
  },
  {
    category: 'history',
    question: 'What is the smallest country in the world?',
    answers: [
      'A. Seychelles\n',
      'B. Maldives\n',
      'C. Tobago\n',
      'D. Vatican City\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'history',
    question: "Which 'Special administrative region of China' has over 7.5 million residents and is therefore one of the most densely populated places in the world?",
    answers: [
      'A. Shandong\n',
      'B. Guangdong\n',
      'C. Hubei\n',
      'D. Hong Kong\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'history',
    question: 'Who was married to John F. Kennedy and was first lady from 1961 until 1963?',
    answers: [
      'A. Michelle LaVaughn Robinson Kennedy\n',
      'B. Jacqueline Kennedy Onassis\n',
      'C. Eleanor Kennedy\n',
      'D. Mamie Geneva Doud Kennedy\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'history',
    question: 'What was the average life expectancy of an Englishman in the middle ages?',
    answers: [
      'A. 13 years\n',
      'B. 21 years\n',
      'C. 41 years\n',
      'D. 33 years\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'history',
    question: 'In what year was the Salyut 1, the first space station ever launched?',
    answers: [
      'A. 1998\n',
      'B. 1971\n',
      'C. 2001\n',
      'D. 1956\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'history',
    question: 'What year did the Chernobyl disaster occur?',
    answers: [
      'A. 1984\n',
      'B. 1987\n',
      'C. 1986\n',
      'D. 1985\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'history',
    question: 'Which country was NOT a Portuguese colony?',
    answers: [
      'A. Brazil\n',
      'B. Mozambique\n',
      'C. Angola\n',
      'D. Colombia\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'history',
    question: 'Which war was fought in South Africa between 1899 and 1902?',
    answers: [
      'A. Boer War\n',
      'B. Second Boer War (Allow Boer War)\n',
      'C. War of South Africa\n',
      'D. Anglo-Zulu War\n'
    ],
    correctAnswer: 'B'
  },

  // NATURE & ANIMALS

  {
    category: 'Nature and Animals',
    question: "Which of these animals don't live in the wild in Australia?",
    answers: [
      'A. Possum\n',
      'B. Opossum\n',
      'C. Kookaburra\n',
      'D. Koala\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Nature and Animals',
    question: 'Hickory trees produce which types of nuts?',
    answers: [
      'A. Pistachios\n',
      'B. Pecans\n',
      'C. Macadamia\n',
      'D. Walnuts\n'
    ],
    correctAnswer: 'B'
  },
  {
    category: 'Nature and Animals',
    question: 'Which planet is known as the morning star, as well as the evening star?',
    answers: [
      'A. Mars\n',
      'B. Jupiter\n',
      'C. Saturn\n',
      'D. Venus\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Nature and Animals',
    question: 'What color skin does a polar bear have?',
    answers: [
      'A. Pink\n',
      'B. Gray\n',
      'C. White\n',
      'D. Black\n'
    ],
    correctAnswer: 'C'
  },
  {
    category: 'Nature and Animals',
    question: 'A Blue Whale has a heart roughly the size of a what?',
    answers: [
      'A. VW Beetle\n',
      'B. Basketball\n',
      'C. Peanut\n',
      'D. Grapefruit\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Nature and Animals',
    question: "This region, famous for its wines, only produces 4% of California's wines. What is the name of this region?",
    answers: [
      'A. Snake River Valley\n',
      'B. Sonoma\n',
      'C. Los Carneros\n',
      'D. Napa Valley\n'
    ],
    correctAnswer: 'D'
  },
  {
    category: 'Nature and Animals',
    question: 'A mongoose would typically feed on which of the following types of animal?',
    answers: [
      'A. Stork\n',
      'B. Earthworm\n',
      'C. Hyena\n',
      'D. Meerkat\n'
    ],
    correctAnswer: 'D'
  }
]

let currentQuestion = null

export const getNewQuestion = (usedQuestions) => {
  currentQuestion = selectRandomQuestion(usedQuestions)
  return currentQuestion
}

export const checkAnswer = (currentQuestion, submittedAnswer) => {
  if (!currentQuestion) {
    throw new Error('No active question to check answer for.')
  }
  return currentQuestion.correctAnswer === submittedAnswer.toUpperCase()
}

// Function to reset the current question
export const resetCurrentQuestion = () => {
  currentQuestion = null
}

// Helper function to select a random question without repeats
const selectRandomQuestion = (usedQuestions) => {
  if (usedQuestions.size === triviaData.length) {
    // All questions have been used, reset the used questions set
    usedQuestions.clear()
  }

  let randomIndex
  do {
    randomIndex = Math.floor(Math.random() * triviaData.length)
  } while (usedQuestions.has(randomIndex))

  usedQuestions.add(randomIndex)
  return { ...triviaData[randomIndex], index: randomIndex }
}

export { selectRandomQuestion }
