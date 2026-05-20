-- Verb Trainer migration
-- Paste this into the Supabase SQL editor and run it.

CREATE TABLE IF NOT EXISTS verbs (
  id BIGSERIAL PRIMARY KEY,
  english TEXT NOT NULL,
  spanish_infinitive TEXT NOT NULL,
  category TEXT NOT NULL,
  present_conjugations JSONB NOT NULL,
  past_conjugations JSONB NOT NULL,
  future_conjugations JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_verb_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  verb_id BIGINT NOT NULL REFERENCES verbs(id),
  stage INTEGER NOT NULL DEFAULT 1,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  mastered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, verb_id)
);

ALTER TABLE verbs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_verb_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Verbs are publicly readable" ON verbs FOR SELECT USING (true);
CREATE POLICY "Users can read own verb progress" ON user_verb_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own verb progress" ON user_verb_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own verb progress" ON user_verb_progress FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- SEED: 70 verbs across 4 categories
-- JSONB format: {"yo":"...","tu":"...","el":"...","nosotros":"...","ellos":"..."}
-- ============================================================

-- Core Verbs (10)
INSERT INTO verbs (english, spanish_infinitive, category, present_conjugations, past_conjugations, future_conjugations) VALUES
('be (identity)', 'ser', 'Core Verbs',
  '{"yo":"soy","tu":"eres","el":"es","nosotros":"somos","ellos":"son"}',
  '{"yo":"fui","tu":"fuiste","el":"fue","nosotros":"fuimos","ellos":"fueron"}',
  '{"yo":"seré","tu":"serás","el":"será","nosotros":"seremos","ellos":"serán"}'),

('be (state/location)', 'estar', 'Core Verbs',
  '{"yo":"estoy","tu":"estás","el":"está","nosotros":"estamos","ellos":"están"}',
  '{"yo":"estuve","tu":"estuviste","el":"estuvo","nosotros":"estuvimos","ellos":"estuvieron"}',
  '{"yo":"estaré","tu":"estarás","el":"estará","nosotros":"estaremos","ellos":"estarán"}'),

('have (possession)', 'tener', 'Core Verbs',
  '{"yo":"tengo","tu":"tienes","el":"tiene","nosotros":"tenemos","ellos":"tienen"}',
  '{"yo":"tuve","tu":"tuviste","el":"tuvo","nosotros":"tuvimos","ellos":"tuvieron"}',
  '{"yo":"tendré","tu":"tendrás","el":"tendrá","nosotros":"tendremos","ellos":"tendrán"}'),

('do / make', 'hacer', 'Core Verbs',
  '{"yo":"hago","tu":"haces","el":"hace","nosotros":"hacemos","ellos":"hacen"}',
  '{"yo":"hice","tu":"hiciste","el":"hizo","nosotros":"hicimos","ellos":"hicieron"}',
  '{"yo":"haré","tu":"harás","el":"hará","nosotros":"haremos","ellos":"harán"}'),

('go', 'ir', 'Core Verbs',
  '{"yo":"voy","tu":"vas","el":"va","nosotros":"vamos","ellos":"van"}',
  '{"yo":"fui","tu":"fuiste","el":"fue","nosotros":"fuimos","ellos":"fueron"}',
  '{"yo":"iré","tu":"irás","el":"irá","nosotros":"iremos","ellos":"irán"}'),

('be able / can', 'poder', 'Core Verbs',
  '{"yo":"puedo","tu":"puedes","el":"puede","nosotros":"podemos","ellos":"pueden"}',
  '{"yo":"pude","tu":"pudiste","el":"pudo","nosotros":"pudimos","ellos":"pudieron"}',
  '{"yo":"podré","tu":"podrás","el":"podrá","nosotros":"podremos","ellos":"podrán"}'),

('want / love', 'querer', 'Core Verbs',
  '{"yo":"quiero","tu":"quieres","el":"quiere","nosotros":"queremos","ellos":"quieren"}',
  '{"yo":"quise","tu":"quisiste","el":"quiso","nosotros":"quisimos","ellos":"quisieron"}',
  '{"yo":"querré","tu":"querrás","el":"querrá","nosotros":"querremos","ellos":"querrán"}'),

('say / tell', 'decir', 'Core Verbs',
  '{"yo":"digo","tu":"dices","el":"dice","nosotros":"decimos","ellos":"dicen"}',
  '{"yo":"dije","tu":"dijiste","el":"dijo","nosotros":"dijimos","ellos":"dijeron"}',
  '{"yo":"diré","tu":"dirás","el":"dirá","nosotros":"diremos","ellos":"dirán"}'),

('know (facts)', 'saber', 'Core Verbs',
  '{"yo":"sé","tu":"sabes","el":"sabe","nosotros":"sabemos","ellos":"saben"}',
  '{"yo":"supe","tu":"supiste","el":"supo","nosotros":"supimos","ellos":"supieron"}',
  '{"yo":"sabré","tu":"sabrás","el":"sabrá","nosotros":"sabremos","ellos":"sabrán"}'),

('see', 'ver', 'Core Verbs',
  '{"yo":"veo","tu":"ves","el":"ve","nosotros":"vemos","ellos":"ven"}',
  '{"yo":"vi","tu":"viste","el":"vio","nosotros":"vimos","ellos":"vieron"}',
  '{"yo":"veré","tu":"verás","el":"verá","nosotros":"veremos","ellos":"verán"}');

-- Everyday Verbs (20)
INSERT INTO verbs (english, spanish_infinitive, category, present_conjugations, past_conjugations, future_conjugations) VALUES
('give', 'dar', 'Everyday Verbs',
  '{"yo":"doy","tu":"das","el":"da","nosotros":"damos","ellos":"dan"}',
  '{"yo":"di","tu":"diste","el":"dio","nosotros":"dimos","ellos":"dieron"}',
  '{"yo":"daré","tu":"darás","el":"dará","nosotros":"daremos","ellos":"darán"}'),

('have (auxiliary)', 'haber', 'Everyday Verbs',
  '{"yo":"he","tu":"has","el":"ha","nosotros":"hemos","ellos":"han"}',
  '{"yo":"hube","tu":"hubiste","el":"hubo","nosotros":"hubimos","ellos":"hubieron"}',
  '{"yo":"habré","tu":"habrás","el":"habrá","nosotros":"habremos","ellos":"habrán"}'),

('speak / talk', 'hablar', 'Everyday Verbs',
  '{"yo":"hablo","tu":"hablas","el":"habla","nosotros":"hablamos","ellos":"hablan"}',
  '{"yo":"hablé","tu":"hablaste","el":"habló","nosotros":"hablamos","ellos":"hablaron"}',
  '{"yo":"hablaré","tu":"hablarás","el":"hablará","nosotros":"hablaremos","ellos":"hablarán"}'),

('arrive', 'llegar', 'Everyday Verbs',
  '{"yo":"llego","tu":"llegas","el":"llega","nosotros":"llegamos","ellos":"llegan"}',
  '{"yo":"llegué","tu":"llegaste","el":"llegó","nosotros":"llegamos","ellos":"llegaron"}',
  '{"yo":"llegaré","tu":"llegarás","el":"llegará","nosotros":"llegaremos","ellos":"llegarán"}'),

('put / place', 'poner', 'Everyday Verbs',
  '{"yo":"pongo","tu":"pones","el":"pone","nosotros":"ponemos","ellos":"ponen"}',
  '{"yo":"puse","tu":"pusiste","el":"puso","nosotros":"pusimos","ellos":"pusieron"}',
  '{"yo":"pondré","tu":"pondrás","el":"pondrá","nosotros":"pondremos","ellos":"pondrán"}'),

('seem', 'parecer', 'Everyday Verbs',
  '{"yo":"parezco","tu":"pareces","el":"parece","nosotros":"parecemos","ellos":"parecen"}',
  '{"yo":"parecí","tu":"pareciste","el":"pareció","nosotros":"parecimos","ellos":"parecieron"}',
  '{"yo":"pareceré","tu":"parecerás","el":"parecerá","nosotros":"pareceremos","ellos":"parecerán"}'),

('stay / remain', 'quedar', 'Everyday Verbs',
  '{"yo":"quedo","tu":"quedas","el":"queda","nosotros":"quedamos","ellos":"quedan"}',
  '{"yo":"quedé","tu":"quedaste","el":"quedó","nosotros":"quedamos","ellos":"quedaron"}',
  '{"yo":"quedaré","tu":"quedarás","el":"quedará","nosotros":"quedaremos","ellos":"quedarán"}'),

('believe', 'creer', 'Everyday Verbs',
  '{"yo":"creo","tu":"crees","el":"cree","nosotros":"creemos","ellos":"creen"}',
  '{"yo":"creí","tu":"creíste","el":"creyó","nosotros":"creímos","ellos":"creyeron"}',
  '{"yo":"creeré","tu":"creerás","el":"creerá","nosotros":"creeremos","ellos":"creerán"}'),

('carry / wear', 'llevar', 'Everyday Verbs',
  '{"yo":"llevo","tu":"llevas","el":"lleva","nosotros":"llevamos","ellos":"llevan"}',
  '{"yo":"llevé","tu":"llevaste","el":"llevó","nosotros":"llevamos","ellos":"llevaron"}',
  '{"yo":"llevaré","tu":"llevarás","el":"llevará","nosotros":"llevaremos","ellos":"llevarán"}'),

('let / leave', 'dejar', 'Everyday Verbs',
  '{"yo":"dejo","tu":"dejas","el":"deja","nosotros":"dejamos","ellos":"dejan"}',
  '{"yo":"dejé","tu":"dejaste","el":"dejó","nosotros":"dejamos","ellos":"dejaron"}',
  '{"yo":"dejaré","tu":"dejarás","el":"dejará","nosotros":"dejaremos","ellos":"dejarán"}'),

('come', 'venir', 'Everyday Verbs',
  '{"yo":"vengo","tu":"vienes","el":"viene","nosotros":"venimos","ellos":"vienen"}',
  '{"yo":"vine","tu":"viniste","el":"vino","nosotros":"vinimos","ellos":"vinieron"}',
  '{"yo":"vendré","tu":"vendrás","el":"vendrá","nosotros":"vendremos","ellos":"vendrán"}'),

('think', 'pensar', 'Everyday Verbs',
  '{"yo":"pienso","tu":"piensas","el":"piensa","nosotros":"pensamos","ellos":"piensan"}',
  '{"yo":"pensé","tu":"pensaste","el":"pensó","nosotros":"pensamos","ellos":"pensaron"}',
  '{"yo":"pensaré","tu":"pensarás","el":"pensará","nosotros":"pensaremos","ellos":"pensarán"}'),

('know (people)', 'conocer', 'Everyday Verbs',
  '{"yo":"conozco","tu":"conoces","el":"conoce","nosotros":"conocemos","ellos":"conocen"}',
  '{"yo":"conocí","tu":"conociste","el":"conoció","nosotros":"conocimos","ellos":"conocieron"}',
  '{"yo":"conoceré","tu":"conocerás","el":"conocerá","nosotros":"conoceremos","ellos":"conocerán"}'),

('take / drink', 'tomar', 'Everyday Verbs',
  '{"yo":"tomo","tu":"tomas","el":"toma","nosotros":"tomamos","ellos":"toman"}',
  '{"yo":"tomé","tu":"tomaste","el":"tomó","nosotros":"tomamos","ellos":"tomaron"}',
  '{"yo":"tomaré","tu":"tomarás","el":"tomará","nosotros":"tomaremos","ellos":"tomarán"}'),

('feel', 'sentir', 'Everyday Verbs',
  '{"yo":"siento","tu":"sientes","el":"siente","nosotros":"sentimos","ellos":"sienten"}',
  '{"yo":"sentí","tu":"sentiste","el":"sintió","nosotros":"sentimos","ellos":"sintieron"}',
  '{"yo":"sentiré","tu":"sentirás","el":"sentirá","nosotros":"sentiremos","ellos":"sentirán"}'),

('try / treat', 'tratar', 'Everyday Verbs',
  '{"yo":"trato","tu":"tratas","el":"trata","nosotros":"tratamos","ellos":"tratan"}',
  '{"yo":"traté","tu":"trataste","el":"trató","nosotros":"tratamos","ellos":"trataron"}',
  '{"yo":"trataré","tu":"tratarás","el":"tratará","nosotros":"trataremos","ellos":"tratarán"}'),

('look / watch', 'mirar', 'Everyday Verbs',
  '{"yo":"miro","tu":"miras","el":"mira","nosotros":"miramos","ellos":"miran"}',
  '{"yo":"miré","tu":"miraste","el":"miró","nosotros":"miramos","ellos":"miraron"}',
  '{"yo":"miraré","tu":"mirarás","el":"mirará","nosotros":"miraremos","ellos":"mirarán"}'),

('call / name', 'llamar', 'Everyday Verbs',
  '{"yo":"llamo","tu":"llamas","el":"llama","nosotros":"llamamos","ellos":"llaman"}',
  '{"yo":"llamé","tu":"llamaste","el":"llamó","nosotros":"llamamos","ellos":"llamaron"}',
  '{"yo":"llamaré","tu":"llamarás","el":"llamará","nosotros":"llamaremos","ellos":"llamarán"}'),

('leave / go out', 'salir', 'Everyday Verbs',
  '{"yo":"salgo","tu":"sales","el":"sale","nosotros":"salimos","ellos":"salen"}',
  '{"yo":"salí","tu":"saliste","el":"salió","nosotros":"salimos","ellos":"salieron"}',
  '{"yo":"saldré","tu":"saldrás","el":"saldrá","nosotros":"saldremos","ellos":"saldrán"}'),

('enter / go in', 'entrar', 'Everyday Verbs',
  '{"yo":"entro","tu":"entras","el":"entra","nosotros":"entramos","ellos":"entran"}',
  '{"yo":"entré","tu":"entraste","el":"entró","nosotros":"entramos","ellos":"entraron"}',
  '{"yo":"entraré","tu":"entrarás","el":"entrará","nosotros":"entraremos","ellos":"entrarán"}');

-- Vivid & Interactive Verbs (20)
INSERT INTO verbs (english, spanish_infinitive, category, present_conjugations, past_conjugations, future_conjugations) VALUES
('eat', 'comer', 'Vivid & Interactive Verbs',
  '{"yo":"como","tu":"comes","el":"come","nosotros":"comemos","ellos":"comen"}',
  '{"yo":"comí","tu":"comiste","el":"comió","nosotros":"comimos","ellos":"comieron"}',
  '{"yo":"comeré","tu":"comerás","el":"comerá","nosotros":"comeremos","ellos":"comerán"}'),

('drink', 'beber', 'Vivid & Interactive Verbs',
  '{"yo":"bebo","tu":"bebes","el":"bebe","nosotros":"bebemos","ellos":"beben"}',
  '{"yo":"bebí","tu":"bebiste","el":"bebió","nosotros":"bebimos","ellos":"bebieron"}',
  '{"yo":"beberé","tu":"beberás","el":"beberá","nosotros":"beberemos","ellos":"beberán"}'),

('buy', 'comprar', 'Vivid & Interactive Verbs',
  '{"yo":"compro","tu":"compras","el":"compra","nosotros":"compramos","ellos":"compran"}',
  '{"yo":"compré","tu":"compraste","el":"compró","nosotros":"compramos","ellos":"compraron"}',
  '{"yo":"compraré","tu":"comprarás","el":"comprará","nosotros":"compraremos","ellos":"comprarán"}'),

('work', 'trabajar', 'Vivid & Interactive Verbs',
  '{"yo":"trabajo","tu":"trabajas","el":"trabaja","nosotros":"trabajamos","ellos":"trabajan"}',
  '{"yo":"trabajé","tu":"trabajaste","el":"trabajó","nosotros":"trabajamos","ellos":"trabajaron"}',
  '{"yo":"trabajaré","tu":"trabajarás","el":"trabajará","nosotros":"trabajaremos","ellos":"trabajarán"}'),

('write', 'escribir', 'Vivid & Interactive Verbs',
  '{"yo":"escribo","tu":"escribes","el":"escribe","nosotros":"escribimos","ellos":"escriben"}',
  '{"yo":"escribí","tu":"escribiste","el":"escribió","nosotros":"escribimos","ellos":"escribieron"}',
  '{"yo":"escribiré","tu":"escribirás","el":"escribirá","nosotros":"escribiremos","ellos":"escribirán"}'),

('play (games)', 'jugar', 'Vivid & Interactive Verbs',
  '{"yo":"juego","tu":"juegas","el":"juega","nosotros":"jugamos","ellos":"juegan"}',
  '{"yo":"jugué","tu":"jugaste","el":"jugó","nosotros":"jugamos","ellos":"jugaron"}',
  '{"yo":"jugaré","tu":"jugarás","el":"jugará","nosotros":"jugaremos","ellos":"jugarán"}'),

('run', 'correr', 'Vivid & Interactive Verbs',
  '{"yo":"corro","tu":"corres","el":"corre","nosotros":"corremos","ellos":"corren"}',
  '{"yo":"corrí","tu":"corriste","el":"corrió","nosotros":"corrimos","ellos":"corrieron"}',
  '{"yo":"correré","tu":"correrás","el":"correrá","nosotros":"correremos","ellos":"correrán"}'),

('open', 'abrir', 'Vivid & Interactive Verbs',
  '{"yo":"abro","tu":"abres","el":"abre","nosotros":"abrimos","ellos":"abren"}',
  '{"yo":"abrí","tu":"abriste","el":"abrió","nosotros":"abrimos","ellos":"abrieron"}',
  '{"yo":"abriré","tu":"abrirás","el":"abrirá","nosotros":"abriremos","ellos":"abrirán"}'),

('close', 'cerrar', 'Vivid & Interactive Verbs',
  '{"yo":"cierro","tu":"cierras","el":"cierra","nosotros":"cerramos","ellos":"cierran"}',
  '{"yo":"cerré","tu":"cerraste","el":"cerró","nosotros":"cerramos","ellos":"cerraron"}',
  '{"yo":"cerraré","tu":"cerrarás","el":"cerrará","nosotros":"cerraremos","ellos":"cerrarán"}'),

('travel', 'viajar', 'Vivid & Interactive Verbs',
  '{"yo":"viajo","tu":"viajas","el":"viaja","nosotros":"viajamos","ellos":"viajan"}',
  '{"yo":"viajé","tu":"viajaste","el":"viajó","nosotros":"viajamos","ellos":"viajaron"}',
  '{"yo":"viajaré","tu":"viajarás","el":"viajará","nosotros":"viajaremos","ellos":"viajarán"}'),

('help', 'ayudar', 'Vivid & Interactive Verbs',
  '{"yo":"ayudo","tu":"ayudas","el":"ayuda","nosotros":"ayudamos","ellos":"ayudan"}',
  '{"yo":"ayudé","tu":"ayudaste","el":"ayudó","nosotros":"ayudamos","ellos":"ayudaron"}',
  '{"yo":"ayudaré","tu":"ayudarás","el":"ayudará","nosotros":"ayudaremos","ellos":"ayudarán"}'),

('search / look for', 'buscar', 'Vivid & Interactive Verbs',
  '{"yo":"busco","tu":"buscas","el":"busca","nosotros":"buscamos","ellos":"buscan"}',
  '{"yo":"busqué","tu":"buscaste","el":"buscó","nosotros":"buscamos","ellos":"buscaron"}',
  '{"yo":"buscaré","tu":"buscarás","el":"buscará","nosotros":"buscaremos","ellos":"buscarán"}'),

('find', 'encontrar', 'Vivid & Interactive Verbs',
  '{"yo":"encuentro","tu":"encuentras","el":"encuentra","nosotros":"encontramos","ellos":"encuentran"}',
  '{"yo":"encontré","tu":"encontraste","el":"encontró","nosotros":"encontramos","ellos":"encontraron"}',
  '{"yo":"encontraré","tu":"encontrarás","el":"encontrará","nosotros":"encontraremos","ellos":"encontrarán"}'),

('listen', 'escuchar', 'Vivid & Interactive Verbs',
  '{"yo":"escucho","tu":"escuchas","el":"escucha","nosotros":"escuchamos","ellos":"escuchan"}',
  '{"yo":"escuché","tu":"escuchaste","el":"escuchó","nosotros":"escuchamos","ellos":"escucharon"}',
  '{"yo":"escucharé","tu":"escucharás","el":"escuchará","nosotros":"escucharemos","ellos":"escucharán"}'),

('pay', 'pagar', 'Vivid & Interactive Verbs',
  '{"yo":"pago","tu":"pagas","el":"paga","nosotros":"pagamos","ellos":"pagan"}',
  '{"yo":"pagué","tu":"pagaste","el":"pagó","nosotros":"pagamos","ellos":"pagaron"}',
  '{"yo":"pagaré","tu":"pagarás","el":"pagará","nosotros":"pagaremos","ellos":"pagarán"}'),

('bring', 'traer', 'Vivid & Interactive Verbs',
  '{"yo":"traigo","tu":"traes","el":"trae","nosotros":"traemos","ellos":"traen"}',
  '{"yo":"traje","tu":"trajiste","el":"trajo","nosotros":"trajimos","ellos":"trajeron"}',
  '{"yo":"traeré","tu":"traerás","el":"traerá","nosotros":"traeremos","ellos":"traerán"}'),

('go up / climb', 'subir', 'Vivid & Interactive Verbs',
  '{"yo":"subo","tu":"subes","el":"sube","nosotros":"subimos","ellos":"suben"}',
  '{"yo":"subí","tu":"subiste","el":"subió","nosotros":"subimos","ellos":"subieron"}',
  '{"yo":"subiré","tu":"subirás","el":"subirá","nosotros":"subiremos","ellos":"subirán"}'),

('go down / descend', 'bajar', 'Vivid & Interactive Verbs',
  '{"yo":"bajo","tu":"bajas","el":"baja","nosotros":"bajamos","ellos":"bajan"}',
  '{"yo":"bajé","tu":"bajaste","el":"bajó","nosotros":"bajamos","ellos":"bajaron"}',
  '{"yo":"bajaré","tu":"bajarás","el":"bajará","nosotros":"bajaremos","ellos":"bajarán"}'),

('lose', 'perder', 'Vivid & Interactive Verbs',
  '{"yo":"pierdo","tu":"pierdes","el":"pierde","nosotros":"perdemos","ellos":"pierden"}',
  '{"yo":"perdí","tu":"perdiste","el":"perdió","nosotros":"perdimos","ellos":"perdieron"}',
  '{"yo":"perderé","tu":"perderás","el":"perderá","nosotros":"perderemos","ellos":"perderán"}'),

('win / earn', 'ganar', 'Vivid & Interactive Verbs',
  '{"yo":"gano","tu":"ganas","el":"gana","nosotros":"ganamos","ellos":"ganan"}',
  '{"yo":"gané","tu":"ganaste","el":"ganó","nosotros":"ganamos","ellos":"ganaron"}',
  '{"yo":"ganaré","tu":"ganarás","el":"ganará","nosotros":"ganaremos","ellos":"ganarán"}');

-- Expressive & Emotional Verbs (20)
INSERT INTO verbs (english, spanish_infinitive, category, present_conjugations, past_conjugations, future_conjugations) VALUES
('like', 'gustar', 'Expressive & Emotional Verbs',
  '{"yo":"gusto","tu":"gustas","el":"gusta","nosotros":"gustamos","ellos":"gustan"}',
  '{"yo":"gusté","tu":"gustaste","el":"gustó","nosotros":"gustamos","ellos":"gustaron"}',
  '{"yo":"gustaré","tu":"gustarás","el":"gustará","nosotros":"gustaremos","ellos":"gustarán"}'),

('should / must / owe', 'deber', 'Expressive & Emotional Verbs',
  '{"yo":"debo","tu":"debes","el":"debe","nosotros":"debemos","ellos":"deben"}',
  '{"yo":"debí","tu":"debiste","el":"debió","nosotros":"debimos","ellos":"debieron"}',
  '{"yo":"deberé","tu":"deberás","el":"deberá","nosotros":"deberemos","ellos":"deberán"}'),

('need', 'necesitar', 'Expressive & Emotional Verbs',
  '{"yo":"necesito","tu":"necesitas","el":"necesita","nosotros":"necesitamos","ellos":"necesitan"}',
  '{"yo":"necesité","tu":"necesitaste","el":"necesitó","nosotros":"necesitamos","ellos":"necesitaron"}',
  '{"yo":"necesitaré","tu":"necesitarás","el":"necesitará","nosotros":"necesitaremos","ellos":"necesitarán"}'),

('wait / hope', 'esperar', 'Expressive & Emotional Verbs',
  '{"yo":"espero","tu":"esperas","el":"espera","nosotros":"esperamos","ellos":"esperan"}',
  '{"yo":"esperé","tu":"esperaste","el":"esperó","nosotros":"esperamos","ellos":"esperaron"}',
  '{"yo":"esperaré","tu":"esperarás","el":"esperará","nosotros":"esperaremos","ellos":"esperarán"}'),

('remember', 'recordar', 'Expressive & Emotional Verbs',
  '{"yo":"recuerdo","tu":"recuerdas","el":"recuerda","nosotros":"recordamos","ellos":"recuerdan"}',
  '{"yo":"recordé","tu":"recordaste","el":"recordó","nosotros":"recordamos","ellos":"recordaron"}',
  '{"yo":"recordaré","tu":"recordarás","el":"recordará","nosotros":"recordaremos","ellos":"recordarán"}'),

('understand', 'entender', 'Expressive & Emotional Verbs',
  '{"yo":"entiendo","tu":"entiendes","el":"entiende","nosotros":"entendemos","ellos":"entienden"}',
  '{"yo":"entendí","tu":"entendiste","el":"entendió","nosotros":"entendimos","ellos":"entendieron"}',
  '{"yo":"entenderé","tu":"entenderás","el":"entenderá","nosotros":"entenderemos","ellos":"entenderán"}'),

('ask for / request', 'pedir', 'Expressive & Emotional Verbs',
  '{"yo":"pido","tu":"pides","el":"pide","nosotros":"pedimos","ellos":"piden"}',
  '{"yo":"pedí","tu":"pediste","el":"pidió","nosotros":"pedimos","ellos":"pidieron"}',
  '{"yo":"pediré","tu":"pedirás","el":"pedirá","nosotros":"pediremos","ellos":"pedirán"}'),

('receive', 'recibir', 'Expressive & Emotional Verbs',
  '{"yo":"recibo","tu":"recibes","el":"recibe","nosotros":"recibimos","ellos":"reciben"}',
  '{"yo":"recibí","tu":"recibiste","el":"recibió","nosotros":"recibimos","ellos":"recibieron"}',
  '{"yo":"recibiré","tu":"recibirás","el":"recibirá","nosotros":"recibiremos","ellos":"recibirán"}'),

('finish', 'terminar', 'Expressive & Emotional Verbs',
  '{"yo":"termino","tu":"terminas","el":"termina","nosotros":"terminamos","ellos":"terminan"}',
  '{"yo":"terminé","tu":"terminaste","el":"terminó","nosotros":"terminamos","ellos":"terminaron"}',
  '{"yo":"terminaré","tu":"terminarás","el":"terminará","nosotros":"terminaremos","ellos":"terminarán"}'),

('allow', 'permitir', 'Expressive & Emotional Verbs',
  '{"yo":"permito","tu":"permites","el":"permite","nosotros":"permitimos","ellos":"permiten"}',
  '{"yo":"permití","tu":"permitiste","el":"permitió","nosotros":"permitimos","ellos":"permitieron"}',
  '{"yo":"permitiré","tu":"permitirás","el":"permitirá","nosotros":"permitiremos","ellos":"permitirán"}'),

('appear', 'aparecer', 'Expressive & Emotional Verbs',
  '{"yo":"aparezco","tu":"apareces","el":"aparece","nosotros":"aparecemos","ellos":"aparecen"}',
  '{"yo":"aparecí","tu":"apareciste","el":"apareció","nosotros":"aparecimos","ellos":"aparecieron"}',
  '{"yo":"apareceré","tu":"aparecerás","el":"aparecerá","nosotros":"apareceremos","ellos":"aparecerán"}'),

('get / achieve', 'conseguir', 'Expressive & Emotional Verbs',
  '{"yo":"consigo","tu":"consigues","el":"consigue","nosotros":"conseguimos","ellos":"consiguen"}',
  '{"yo":"conseguí","tu":"conseguiste","el":"consiguió","nosotros":"conseguimos","ellos":"consiguieron"}',
  '{"yo":"conseguiré","tu":"conseguirás","el":"conseguirá","nosotros":"conseguiremos","ellos":"conseguirán"}'),

('serve', 'servir', 'Expressive & Emotional Verbs',
  '{"yo":"sirvo","tu":"sirves","el":"sirve","nosotros":"servimos","ellos":"sirven"}',
  '{"yo":"serví","tu":"serviste","el":"sirvió","nosotros":"servimos","ellos":"sirvieron"}',
  '{"yo":"serviré","tu":"servirás","el":"servirá","nosotros":"serviremos","ellos":"servirán"}'),

('take out / extract', 'sacar', 'Expressive & Emotional Verbs',
  '{"yo":"saco","tu":"sacas","el":"saca","nosotros":"sacamos","ellos":"sacan"}',
  '{"yo":"saqué","tu":"sacaste","el":"sacó","nosotros":"sacamos","ellos":"sacaron"}',
  '{"yo":"sacaré","tu":"sacarás","el":"sacará","nosotros":"sacaremos","ellos":"sacarán"}'),

('maintain', 'mantener', 'Expressive & Emotional Verbs',
  '{"yo":"mantengo","tu":"mantienes","el":"mantiene","nosotros":"mantenemos","ellos":"mantienen"}',
  '{"yo":"mantuve","tu":"mantuviste","el":"mantuvo","nosotros":"mantuvimos","ellos":"mantuvieron"}',
  '{"yo":"mantendré","tu":"mantendrás","el":"mantendrá","nosotros":"mantendremos","ellos":"mantendrán"}'),

('result / turn out', 'resultar', 'Expressive & Emotional Verbs',
  '{"yo":"resulto","tu":"resultas","el":"resulta","nosotros":"resultamos","ellos":"resultan"}',
  '{"yo":"resulté","tu":"resultaste","el":"resultó","nosotros":"resultamos","ellos":"resultaron"}',
  '{"yo":"resultaré","tu":"resultarás","el":"resultará","nosotros":"resultaremos","ellos":"resultarán"}'),

('create', 'crear', 'Expressive & Emotional Verbs',
  '{"yo":"creo","tu":"creas","el":"crea","nosotros":"creamos","ellos":"crean"}',
  '{"yo":"creé","tu":"creaste","el":"creó","nosotros":"creamos","ellos":"crearon"}',
  '{"yo":"crearé","tu":"crearás","el":"creará","nosotros":"crearemos","ellos":"crearán"}'),

('hear', 'oír', 'Expressive & Emotional Verbs',
  '{"yo":"oigo","tu":"oyes","el":"oye","nosotros":"oímos","ellos":"oyen"}',
  '{"yo":"oí","tu":"oíste","el":"oyó","nosotros":"oímos","ellos":"oyeron"}',
  '{"yo":"oiré","tu":"oirás","el":"oirá","nosotros":"oiremos","ellos":"oirán"}'),

('finish / end', 'acabar', 'Expressive & Emotional Verbs',
  '{"yo":"acabo","tu":"acabas","el":"acaba","nosotros":"acabamos","ellos":"acaban"}',
  '{"yo":"acabé","tu":"acabaste","el":"acabó","nosotros":"acabamos","ellos":"acabaron"}',
  '{"yo":"acabaré","tu":"acabarás","el":"acabará","nosotros":"acabaremos","ellos":"acabarán"}'),

('sleep', 'dormir', 'Expressive & Emotional Verbs',
  '{"yo":"duermo","tu":"duermes","el":"duerme","nosotros":"dormimos","ellos":"duermen"}',
  '{"yo":"dormí","tu":"dormiste","el":"durmió","nosotros":"dormimos","ellos":"durmieron"}',
  '{"yo":"dormiré","tu":"dormirás","el":"dormirá","nosotros":"dormiremos","ellos":"dormirán"}');
