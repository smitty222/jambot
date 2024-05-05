// trivia.js

//trivia questions
const triviaData = [

  //miscellaneous
  
    {
      "question": "What is the capital of Japan?",
      "answers": ["A. Tokyo", "B. Seoul", "C. Beijing", "D. Bangkok"],
      "correctAnswer": "A"
    },
    {
      "question": "Which planet is known as the 'Morning Star'?",
      "answers": ["A. Mars", "B. Venus", "C. Jupiter", "D. Saturn"],
      "correctAnswer": "B"
    },
    {
      "question": "Who is the lead vocalist of the rock band Queen?",
      "answers": ["A. Freddie Mercury", "B. John Deacon", "C. Brian May", "D. Roger Taylor"],
      "correctAnswer": "D"
    },
    {
      "question": "In Greek mythology, who was the king of the gods?",
      "answers": ["A. Zeus", "B. Poseidon", "C. Hades", "D. Apollo"],
      "correctAnswer": "C"
    },
    {
      "question": "What is the chemical symbol for iron?",
      "answers": ["A. Ir", "B. Fe", "C. In", "D. I"],
      "correctAnswer": "A"
    },
    {
      "question": "What is the largest ocean on Earth?",
      "answers": ["A. Atlantic Ocean", "B. Indian Ocean", "C. Arctic Ocean", "D. Pacific Ocean"],
      "correctAnswer": "D"
    },
    {
      "question": "Which Shakespearean play features the character Hamlet?",
      "answers": ["A. Macbeth", "B. Othello", "C. Hamlet", "D. King Lear"],
      "correctAnswer": "C"
    },
    {
      "question": "Who painted the famous artwork 'The Starry Night'?",
      "answers": ["A. Pablo Picasso", "B. Vincent van Gogh", "C. Claude Monet", "D. Salvador Dalí"],
      "correctAnswer": "B"
    },
    {
      "question": "What is the chemical symbol for sodium?",
      "answers": ["A. Sa", "B. So", "C. Sn", "D. Na"],
      "correctAnswer": "D"
    },
    {
      "question": "Which continent is the largest by land area?",
      "answers": ["A. Africa", "B. Asia", "C. North America", "D. Europe"],
      "correctAnswer": "B"
    },
    {
      "question": "Who is known as the 'Father of Modern Physics'?",
      "answers": ["A. Isaac Newton", "B. Albert Einstein", "C. Galileo Galilei", "D. Nikola Tesla"],
      "correctAnswer": "C"
    },
    {
      "question": "What is the main ingredient in hummus?",
      "answers": ["A. Chickpeas", "B. Lentils", "C. Black beans", "D. Kidney beans"],
      "correctAnswer": "A"
    },
    {
      "question": "What is the chemical symbol for silver?",
      "answers": ["A. Si", "B. Ag", "C. Au", "D. Hg"],
      "correctAnswer": "B"
    },

    
    
    // SPORTS!!!

    {
      "question": "Which country won the first ever FIFA World Cup in 1930?",
      "answers": ["A. Uruguay", "B. Brazil", "C. Italy", "D. Germany"],
      "correctAnswer": "B"
    },
    {
      "question": "Who holds the record for the most Grand Slam singles titles in tennis?",
      "answers": ["A. Roger Federer", "B. Rafael Nadal", "C. Novak Djokovic", "D. Serena Williams"],
      "correctAnswer": "C"
    },
    {
      "question": "In which year did the modern Olympic Games resume after a hiatus during World War II?",
      "answers": ["A. 1948", "B. 1952", "C. 1944", "D. 1940"],
      "correctAnswer": "D"
    },
    {
      "question": "Which NFL team has won the most Super Bowl titles?",
      "answers": ["A. New England Patriots", "B. Pittsburgh Steelers", "C. San Francisco 49ers", "D. Dallas Cowboys"],
      "correctAnswer": "C"
    },
    {
      "question": "Who was the first athlete to run a mile in less than four minutes?",
      "answers": ["A. Roger Bannister", "B. Steve Prefontaine", "C. Sebastian Coe", "D. Usain Bolt"],
      "correctAnswer": "D"
    },
    {
      "question": "What sport does the term 'birdie' come from?",
      "answers": ["A. Golf", "B. Badminton", "C. Tennis", "D. Cricket"],
      "correctAnswer": "A"
    },
    {
      "question": "Who is the NBA's all-time leading scorer?",
      "answers": ["A. Kareem Abdul-Jabbar", "B. LeBron James", "C. Michael Jordan", "D. Kobe Bryant"],
      "correctAnswer": "B"
    },
    {
      "question": "In what year were the first modern Olympic Games held?",
      "answers": ["A. 1896", "B. 1900", "C. 1904", "D. 1886"],
      "correctAnswer": "A"
    },
    {
      "question": "Which country has won the most Rugby World Cup titles?",
      "answers": ["A. New Zealand", "B. Australia", "C. South Africa", "D. England"],
      "correctAnswer": "B"
    },
    {
      "question": "Who holds the record for the most career home runs in Major League Baseball?",
      "answers": ["A. Barry Bonds", "B. Babe Ruth", "C. Hank Aaron", "D. Alex Rodriguez"],
      "correctAnswer": "D"
    },
    {
      "question": "What is the official national sport of Canada?",
      "answers": ["A. Ice Hockey", "B. Lacrosse", "C. Curling", "D. Soccer"],
      "correctAnswer": "B"
    },
    {
      "question": "Who is the only boxer to have won world titles in eight different weight divisions?",
      "answers": ["A. Manny Pacquiao", "B. Floyd Mayweather Jr.", "C. Sugar Ray Leonard", "D. Muhammad Ali"],
      "correctAnswer": "C"
    },
    {
      "question": "Which Formula One driver holds the record for the most World Championships?",
      "answers": ["A. Lewis Hamilton", "B. Michael Schumacher", "C. Ayrton Senna", "D. Sebastian Vettel"],
      "correctAnswer": "D"
    },
    {
      "question": "What is the only country to have played in every single FIFA World Cup tournament?",
      "answers": ["A. Brazil", "B. Germany", "C. Argentina", "D. Italy"],
      "correctAnswer": "C"
    },
    {
      "question": "What is the term for scoring three goals in a single game in ice hockey?",
      "answers": ["A. Hat trick", "B. Triple play", "C. Three-pointer", "D. Trifecta"],
      "correctAnswer": "A"
    },
    {
      "question": "Which city hosted the Summer Olympics in 2016?",
      "answers": ["A. Rio de Janeiro", "B. London", "C. Beijing", "D. Sydney"],
      "correctAnswer": "C"
    },
    {
      "question": "What is the name of the trophy awarded to the winner of the NHL playoffs?",
      "answers": ["A. Stanley Cup", "B. Lombardi Trophy", "C. Commissioner's Trophy", "D. Conn Smythe Trophy"],
      "correctAnswer": "B"
    },
    {
      "question": "Who won the FIFA Women's World Cup in 2019?",
      "answers": ["A. United States", "B. Netherlands", "C. Germany", "D. Sweden"],
      "correctAnswer": "A"
    },
    {
      "question": "Which tennis player is known as the 'King of Clay'?",
      "answers": ["A. Rafael Nadal", "B. Roger Federer", "C. Novak Djokovic", "D. Andy Murray"],
      "correctAnswer": "B"
    },
    {
      "question": "Who is the only athlete to win Olympic gold medals in both the 100m and 200m sprints in three consecutive Olympic Games?",
      "answers": ["A. Usain Bolt", "B. Carl Lewis", "C. Jesse Owens", "D. Michael Johnson"],
      "correctAnswer": "A"
    }, 

    //Entertainment

    {
      "question": "What was the original name of Mickey Mouse?",
      "answers": ["A. The Rat", "B. Mortimer Mouse", "C. Marshall Mouse", "D. Marvin Mouse"],
      "correctAnswer": "B"
    },
    {
      "question": "Which superhero, with the alter ego Wade Wilson and the powers of accelerated healing, was played by Ryan Reynolds in a 2016 film of the same name?",
      "answers": ["A. Ant-Man", "B. Hawk", "C. Deadpool", "D. Black Panther"],
      "correctAnswer": "C"
    },
    {
      "question": "What is the next line for American Pie? Bye, bye Miss American Pie _________",
      "answers": ["A. I am hitting the road", "B. Drove my Chevy to the levee", "C. Good Luck to you", "D. I don’t want to see you again"],
      "correctAnswer": "B"
    },
    {
      "question": "Who was the first Disney character created by Walt Disney?",
      "answers": ["A. Alladin", "B. Mickey Mouse", "C. Sleeping Beauty", "D. Donald Duck"],
      "correctAnswer": "B"
    },
    {
      "question": "Who sings Poker Face?",
      "answers": ["A. Taylor Swift", "B. Kelly Clarkson", "C. Madonna", "D. Lady Gaga"],
      "correctAnswer": "D"
    },
    {
      "question": "How would Groot answer this question?",
      "answers": ["A. Groot I am young padawan", "B. YO homie whats up!", "C. I am groot", "D. Mark is the bomb yo!"],
      "correctAnswer": "C"
    },
    {
      "question": "What did Aladdin steal in the marketplace at the beginning of 'Aladdin'?",
      "answers": ["A. Rice", "B. Gold", "C. Bread", "D. Apple"],
      "correctAnswer": "C"
    },
    {
      "question": "Stark Industries is associated with which fictional superhero?",
      "answers": ["A. Hulk", "B. Iron Man", "C. Captain America", "D. Iron Fist"],
      "correctAnswer": "B"
    },
    {
      "question": "In Zootopia, Officer Judy Hopps is what kind of animal?",
      "answers": ["A. Deer", "B. Fox", "C. Kangaroo", "D. Rabbit"],
      "correctAnswer": "D"
    },
    {
      "question": "Which superhero gains his transformation following accidental exposure to gamma rays during the detonation of an experimental bomb?",
      "answers": ["A. The Human Flame", "B. Silversurfer", "C. Hulk", "D. Iron Man"],
      "correctAnswer": "C"
    },
    {
      "question": "What are the names of Cinderella’s evil stepsisters?",
      "answers": ["A. Gizelle and Anabelle", "B. Pam and Shirley", "C. Anastasia and Drizella", "D. Florence and Marge"],
      "correctAnswer": "C"
    },
    {
      "question": "Mary Jane Watson has been portrayed by which actress in three movies directed by Sam Raimi?",
      "answers": ["A. Zendaya", "B. Shailene Woodley", "C. Kirsten Dunst", "D. Stephanie Tyler"],
      "correctAnswer": "C"
    },
    {
      "question": "Which College Is Elle Applying For In Legally Blonde?",
      "answers": ["A. Duke", "B. Harvard", "C. Princeton", "D. Yale"],
      "correctAnswer": "B"
    },
    {
      "question": "In Harry Potter, who is Fluffy?",
      "answers": ["A. Harry’s Owl", "B. Hermione’s Cat", "C. Hagrid’s Dragon", "D. Hagrid’s 3 Headed Dog"],
      "correctAnswer": "D"
    },
    {
      "question": "What’s the name of the sword in The Sword In The Stone?",
      "answers": ["A. Nibue", "B. Excalibur", "C. Callandor", "D. Glamdring"],
      "correctAnswer": "B"
    },
    {
      "question": "Which Museum Is Featured In Night at the Museum?",
      "answers": ["A. The Smithsonian", "B. National Museum of the American Indian", "C. Museum of Natural History", "D. The Louvre"],
      "correctAnswer": "C"
    },
    {
      "question": "In the early days it was called ‘The DB’, but which fictional New York City tabloid newspaper often appears in the comic books published by Marvel Comics?",
      "answers": ["A. The Times", "B. The Chronicle", "C. The Daily Bugle", "D. The Daily News"],
      "correctAnswer": "C"
    },
    {
      "question": "Which superhero is commonly known as Logan and sometimes as Weapon X?",
      "answers": ["A. Green Lantern", "B. Wolverine", "C. Silver Surfer", "D. Aquaman"],
      "correctAnswer": "B"
    },
    {
      "question": "Which Magazine Does Miranda Work For In The Devil Wears Prada?",
      "answers": ["A. The Thread", "B. Fashion Bash", "C. Upper Elite", "D. Runway"],
      "correctAnswer": "D"
    },
    {
      "question": "Who sings 'Blurred Lines'?",
      "answers": ["A. Nick Cannon", "B. Pharrell Williams", "C. Pitbull", "D. Robin Thicke"],
      "correctAnswer": "D"
    },
    {
      "question": "The Playstation game console was developed by which company?",
      "answers": ["A. Capcom", "B. Nintendo", "C. Sega", "D. Sony"],
      "correctAnswer": "D"
    },
    {
      "question": "Which part of his body did Charlie Chaplin insure?",
      "answers": ["A. Face", "B. Moustache", "C. Hands", "D. Feet"],
      "correctAnswer": "D"
    },
    {
      "question": "What is the license plate of the DeLorean in the Back to the Future films?",
      "answers": ["A. 88timego", "B. Outatime", "C. 1Time", "D. GoFuture"],
      "correctAnswer": "B"
    },

    //SCIENCE!

    {
      "question": "What is the name of the element with the chemical symbol ‘He’?",
      "answers": ["A. Hafnium", "B. Hydrogen", "C. Helium", "D. Holmium"],
      "correctAnswer": "C"
    },
    {
      "question": "Which one of the following is the largest ocean in the world?",
      "answers": ["A. Atlantic Ocean", "B. Indian Ocean", "C. Arctic Ocean", "D. Pacific Ocean"],
      "correctAnswer": "D"
    },
    {
      "question": "Which star is the brightest star in the night sky?",
      "answers": ["A. None of these", "B. Arcturus", "C. Sirius A", "D. North Star"],
      "correctAnswer": "C"
    },
    {
      "question": "Sodium Hydrogen Bicarbonate is a scientific name of which common thing?",
      "answers": ["A. Salt", "B. Baking Soda", "C. Cream or Tartar", "D. Carbonated Water"],
      "correctAnswer": "B"
    },
    {
      "question": "Name the bird in the following which has the largest wingspan?",
      "answers": ["A. Emperor Penguin", "B. Emu", "C. Dalmatian Pelican", "D. Albatross bird"],
      "correctAnswer": "D"
    },
    {
      "question": "Which animal can be seen on the Porsche logo?",
      "answers": ["A. Cougar", "B. Horse", "C. Cheetah", "D. Dog"],
      "correctAnswer": "B"
    },
    {
      "question": "What type of scientist studies living plants?",
      "answers": ["A. Geologist", "B. Botanist", "C. Paleontologist", "D. Entomologist"],
      "correctAnswer": "B"
    },
    {
      "question": "Which of the following is NOT scientifically considered a fruit?",
      "answers": ["A. Pumpkin", "B. Broccoli", "C. Pear", "D. Tomato"],
      "correctAnswer": "B"
    },
    {
      "question": "How is the Earth protected from the effects of Solar Winds from the Sun?",
      "answers": ["A. The color of the sky", "B. Magnetic field", "C. Gravity", "D. Oxygen"],
      "correctAnswer": "B"
    },
    {
      "question": "All species of lemurs are native to which island country?",
      "answers": ["A. Australia", "B. Madagascar", "C. Sri Lanka", "D. Indonesia"],
      "correctAnswer": "B"
    },
    {
      "question": "How many litres are there in a barrel of oil?",
      "answers": ["A. 189", "B. 159", "C. 29", "D. 59"],
      "correctAnswer": "B"
    },
    {
      "question": "Which British archaeologist discovered Tutankhamun’s tomb?",
      "answers": ["A. Ippolito Rosellini", "B. Thomas Young", "C. Karl Richard Lepsius", "D. Howard Carter"],
      "correctAnswer": "D"
    },
    {
      "question": "A 'lepidopterist' is someone who studies which type of creature?",
      "answers": ["A. Birds", "B. Butterflies", "C. Ants", "D. Fish"],
      "correctAnswer": "B"
    },
    {
      "question": "A lobsters teeth are located in which part of its body?",
      "answers": ["A. Mouth", "B. Claws", "C. Stomach", "D. Legs"],
      "correctAnswer": "B"
    },

    //HISTORY

    {
      "question": "Who was the second president of the USA?",
      "answers": ["A. Thomas Jefferson", "B. John Quincy Adams", "C. Benjamin Franklin", "D. John Adams"],
      "correctAnswer": "D"
    },
    {
      "question": "Where is the Great Wall Located?",
      "answers": ["A. Japan", "B. China", "C. South Korea", "D. North Korea"],
      "correctAnswer": "B"
    },
    {
      "question": "Mr. Pibb was a soft drink created by the Coca-Cola Company to compete with what other soft drink?",
      "answers": ["A. Dr. Pepper", "B. Cherry Cola", "C. Root beer", "D. Mountain Dew"],
      "correctAnswer": "A"
    },
    {
      "question": "What is the smallest country in the world?",
      "answers": ["A. Seychelles", "B. Maldives", "C. Tobago", "D. Vatican City"],
      "correctAnswer": "D"
    },
    {
      "question": "Which 'Special administrative region of China' has over 7.5 million residents and is therefore one of the most densely populated places in the world?",
      "answers": ["A. Shandong", "B. Guangdong", "C. Hubei", "D. Hong Kong"],
      "correctAnswer": "D"
    },
    {
      "question": "Who was married to John F. Kennedy and was first lady from 1961 until 1963?",
      "answers": ["A. Michelle LaVaughn Robinson Kennedy", "B. Jacqueline Kennedy Onassis", "C. Eleanor Kennedy", "D. Mamie Geneva Doud Kennedy"],
      "correctAnswer": "B"
    },
    {
      "question": "What was the average life expectancy of an Englishman in the middle ages?",
      "answers": ["A. 13 years", "B. 21 years", "C. 41 years", "D. 33 years"],
      "correctAnswer": "D"
    },
    {
      "question": "In what year was the Salyut 1, the first space station ever launched?",
      "answers": ["A. 1998", "B. 1971", "C. 2001", "D. 1956"],
      "correctAnswer": "B"
    },
    {
      "question": "What year did the Chernobyl disaster occur?",
      "answers": ["A. 1984", "B. 1987", "C. 1986", "D. 1985"],
      "correctAnswer": "C"
    },
    {
      "question": "Which country was NOT a Portuguese colony?",
      "answers": ["A. Brazil", "B. Mozambique", "C. Angola", "D. Colombia"],
      "correctAnswer": "D"
    },
    {
      "question": "What is the official name of the French civil code, established under the French Consulate in 1804 and still in force today?",
      "answers": ["A. Constitution des empereurs", "B. Oeil pour Dent", "C. Code de la route", "D. Code civil des Français"],
      "correctAnswer": "D"
    },
    {
      "question": "Which war was fought in South Africa between 1899 and 1902?",
      "answers": ["A. Boer War", "B. Second Boer War (Allow Boer War)", "C. War of South Africa", "D. Anglo-Zulu War"],
      "correctAnswer": "B"
    },

    //NATURE & ANIMALS

    {
      "question": "Which of these animals don’t live in the wild in Australia?",
      "answers": ["A. Possum", "B. Opossum", "C. Kookaburra", "D. Koala"],
      "correctAnswer": "B"
    },
    {
      "question": "Hickory trees produce which types of nuts?",
      "answers": ["A. Pistachios", "B. Pecans", "C. Macadamia", "D. Walnuts"],
      "correctAnswer": "B"
    },
    {
      "question": "Which planet is known as the morning star, as well as the evening star?",
      "answers": ["A. Mars", "B. Jupiter", "C. Saturn", "D. Venus"],
      "correctAnswer": "D"
    },
    {
      "question": "What color skin does a polar bear have?",
      "answers": ["A. Pink", "B. Gray", "C. White", "D. Black"],
      "correctAnswer": "C"
    },
    {
      "question": "A Blue Whale has a heart roughly the size of a what?",
      "answers": ["A. VW Beetle", "B. Basketball", "C. Peanut", "D. Grapefruit"],
      "correctAnswer": "D"
    },
    {
      "question": "This region, famous for its wines, only produces 4% of California’s wines. What is the name of this region?",
      "answers": ["A. Snake River Valley", "B. Sonoma", "C. Los Carneros", "D. Napa Valley"],
      "correctAnswer": "D"
    },
    {
      "question": "A mongoose would typically feed on which of the following types of animal?",
      "answers": ["A. Stork", "B. Earthworm", "C. Hyena", "D. Meerkat"],
      "correctAnswer": "D"
    },
    {
      "question": "Which country flag, nicknamed “The Maple Leaf’, consists of a red field with a white square and features a red maple leaf at its center?",
      "answers": ["A. Turkey", "B. Vietnam", "C. Canada", "D. Colombia"],
      "correctAnswer": "C"
    },

    //SPORTS & LEISURE

    {
      "question": "Which athlete has won eight gold medals at a single Olympics?",
      "answers": ["A. Vera Caslavska", "B. Michael Phelps", "C. Lloyd Spooner", "D. Agnes Keleti"],
      "correctAnswer": "B"
    },
    {
      "question": "What popular beverage once contained cocaine?",
      "answers": ["A. Powerade", "B. Coca-Cola", "C. Schweppes", "D. Dr Pepper"],
      "correctAnswer": "B"
    },
    {
      "question": "Which is the largest food and drink company in the world?",
      "answers": ["A. Kellogg Company", "B. Pepsi", "C. Nestlé", "D. Danone"],
      "correctAnswer": "C"
    },
    {
      "question": "Henry John Heinz founded a company specializing in the production of which food product?",
      "answers": ["A. Mustard", "B. Relish", "C. Mayonnaise", "D. Ketchup"],
      "correctAnswer": "D"
    },
    {
      "question": "The name of which game is derived from the Swahili word which means ‘to build’?",
      "answers": ["A. Jenga", "B. K’Nex", "C. Lego", "D. Kepla"],
      "correctAnswer": "A"
    },
    {
      "question": "What is the primary ingredient in guacamole?",
      "answers": ["A. Banana", "B. Avocado", "C. Pineapple", "D. Tomato"],
      "correctAnswer": "B"
    },
    {
      "question": "In a game of bingo, which number is traditionally represented by the phrase “two little ducks”?",
      "answers": ["A. 11", "B. 59", "C. 22", "D. 14"],
      "correctAnswer": "C"
    },
    {
      "question": "At the 1996 Summer Olympics, in what sport was the U.S. team nicknamed the “Magnificent 7”?",
      "answers": ["A. Diving", "B. Gymnastics", "C. Swimming", "D. Track and Field"],
      "correctAnswer": "B"
    },
    {
      "question": "Which animal is, according to the New York times, by far the most expensive animal to keep in a zoo?",
      "answers": ["A. Hippo", "B. Toucan", "C. Elephant", "D. Giant panda"],
      "correctAnswer": "D"
    },
    {
      "question": "How many players are on the ice per team in an Ice Hockey game?",
      "answers": ["A. 8", "B. 7", "C. 5", "D. 6"],
      "correctAnswer": "D"
    },
    {
      "question": "What is the alcoholic beverage ‘sake’ made of?",
      "answers": ["A. Rice", "B. Wasabi", "C. Soybeans", "D. Seafood"],
      "correctAnswer": "A"
    },
    {
      "question": "What is the maximum time allowed to find a lost ball while playing Golf?",
      "answers": ["A. 6", "B. 4", "C. 7", "D. 5"],
      "correctAnswer": "D"
    },
    {
      "question": "Which is an Icelandic traditional dish?",
      "answers": ["A. Rugbrød", "B. Lutefisk", "C. Sheep’s head", "D. Krebinetter"],
      "correctAnswer": "C"
    },
    {
      "question": "In 1989, NHL player Pelle Eklund scored the fastest goal in NHL playoff history. How long did it take?",
      "answers": ["A. 22 Seconds", "B. 11 Seconds", "C. 31 Seconds", "D. 5 Seconds"],
      "correctAnswer": "B"
    },
    {
      "question": "First released in 1982, what actor’s workout videos gained worldwide popularity?",
      "answers": ["A. Raquel Welch", "B. Jaqueline Smith", "C. Heather Locklear", "D. Jane Fonda"],
      "correctAnswer": "D"
    },
    {
      "question": "What Italian brand of handbags, footwear, accessories, … was founded in 1921 in Florence?",
      "answers": ["A. Delpozo", "B. Dolce & Gabbana", "C. Hugo Boss", "D. Gucci"],
      "correctAnswer": "D"
    },
    {
      "question": "Which country does gouda cheese come from?",
      "answers": ["A. Denmark", "B. Netherlands", "C. Switzerland", "D. Belgium"],
      "correctAnswer": "B"
    },
    {
      "question": "Which of these martial arts has its origins in China?",
      "answers": ["A. Krav Maga", "B. Jujutsu", "C. Karate", "D. Kung fu"],
      "correctAnswer": "D"
    },
    {
      "question": "Worldwide, what is the third most popular drink?",
      "answers": ["A. Tea", "B. Beer", "C. Water", "D. Coffee"],
      "correctAnswer": "A"
    },
    {
      "question": "Which company was the first to use Santa Claus in an ad?",
      "answers": ["A. Walmart", "B. Target", "C. Pepsi", "D. Coca Cola"],
      "correctAnswer": "D"
    }
    
]
    

// Function to select a random question from triviaData
export const selectRandomQuestion = () => {
  const randomIndex = Math.floor(Math.random() * triviaData.length);
  return triviaData[randomIndex];
};

// Function to check if the submitted answer is correct
export const checkAnswer = (question, submittedAnswer) => {
  return question.correctAnswer === submittedAnswer.toUpperCase();
};
