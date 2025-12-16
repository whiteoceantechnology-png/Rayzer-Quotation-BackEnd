## Install Mongodb

With Homebrew you can just run `brew install mongodb` and after `brew services start mongodb`.

---

## Raven Log

For get raven log create account here: [Sentry](https://sentry.io/)

---

## Body Whitelist

For security have add a whitelist function for your `req.body` coming from the front end. You can take a look of it in the `contants.js` file.

```js
const WHITELIST = {
  posts: {
    create: ['title', 'text'],
    update: ['title', 'text'],
  },
  users: {
    create: ['email', 'username', 'password'],
  },
};
```

## Pre-Commit Hook

I've add `pre-commit` and `lint-staged` for lint your code before commit. That can maybe take time :bowtie:

---

## Scripts

### DEV

```
yarn dev
```

or

```
npm run dev
```

**PS** That can crash if this is the first time but don't worry give it 2 sec the scripts gonna work. He just need to created a dist folder :) This way you have only one command to run.

### DEV-DEBUG

```
yarn dev:debug
```

or

```
npm run dev:debug
```

---

## Why toJSON on methods model ?

`toJSON()` help us to get only the data we want when we push the info to the client. So now we just need to put the user object in the `res.json(user)` and we received only what we want. Why `toAuthJSON()` ? Cause if we populated the post we get the `toJSON()` so the `toAuthJSON()` is the on to call on signup and login for get the token and _id.

```js
toAuthJSON() {
  return {
    _id: this._id,
    token: `JWT ${this.createToken()}`,
  };
},

toJSON() {
  return {
    _id: this._id,
    username: this.username,
  };
},
```

---

## For Validation on Request

I'm using Joi in this boilerplate, that make the validation really easy.

```js
export const validation = {
  create: {
    body: {
      email: Joi.string().email().required(),
      password: Joi.string().regex(/^[a-zA-Z0-9]{3,30}$/).required(),
      username: Joi.string().min(3).max(20).required(),
    },
  },
};

routes.post(
  '/signup',
  validate(UserController.validation.create),
  UserController.create,
);
```

## Seeds

For seed just run one of this following comand. This is helpful in dev for making fake user.

**This is only available in dev environment**

*You can change the number of seed by changing the number in each script inside `/scripts/seeds`*

- Seeds 10 user `yarn db:seeds-user`
- Clear user collection `yarn db:seeds-clear-user`
- Clear all collection `yarn db:seeds-clear`

---

Monitoring Server on `http://localhost:3000/status`

---


## Docker

```
bash scripts/development.sh
```

---

## Techs

- [Helmet](https://github.com/helmetjs/helmet)
- [Cors](https://github.com/expressjs/cors)
- [Body-Parser](https://github.com/expressjs/body-parser)
- [Morgan](https://github.com/expressjs/morgan)
- [PassportJS](https://github.com/jaredhanson/passport)
- [Passport-Local](https://github.com/jaredhanson/passport-local)
- [Passport-JWT](https://github.com/themikenicholson/passport-jwt)
- [Raven](https://github.com/getsentry/raven-node)
- [Joi](https://github.com/hapijs/joi)
- [Http-Status](https://github.com/adaltas/node-http-status)
- [Lint-Staged](https://github.com/okonet/lint-staged)
- [Husky](https://github.com/typicode/husky)
- [Prettier](https://github.com/prettier/prettier)
- [Eslint Config Prettier](https://github.com/prettier/eslint-config-prettier)
- [CodeClimate](https://codeclimate.com/)
- [Coveralls](https://github.com/integrations/coveralls)
- [Travis Ci](https://travis-ci.org/)
- [Circle Ci](https://circleci.com/)
- [Greenkeeper](https://greenkeeper.io/)
- [Istanbul](https://github.com/gotwarlost/istanbul)
- [Mocha](https://github.com/mochajs/mocha)
- [Chai](https://github.com/chaijs/chai)
- [Supertest](https://github.com/visionmedia/supertest)
- [NPS](https://github.com/kentcdodds/nps)
- [MongoDB](https://www.mongodb.com/)
- [Mongoose](http://mongoosejs.com/)
- [Webpack3](https://webpack.js.org/)

---

## Todo

- [x] Test seeds controller - Done by [cpenarrieta](https://github.com/cpenarrieta)
- [ ] Sendgrid or Other Mail supply
- [ ] Add S3 for user image
- [ ] Change Mocha for Jest
