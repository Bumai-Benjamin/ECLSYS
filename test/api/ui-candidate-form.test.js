// UI-3: Add candidate checks before MetaMask opens (spec §5.2).
var expect = require('chai').expect;
var CandidateForm = require('../../src/js/validate-candidate');

function valid(overrides) {
  return Object.assign({ name: 'Alice Nangolo', party: 'Independent', age: '45', qualification: 'BA Law' }, overrides);
}

function errors(overrides) {
  return CandidateForm.validate(valid(overrides));
}

describe('UI-3 candidate form checks', function () {
  it('valid input gives no errors', function () {
    expect(CandidateForm.validate(valid())).to.deep.equal({});
  });

  it('name', function () {
    expect(errors({ name: '' })).to.deep.equal({ name: 'Enter the candidate\'s name.' });
    expect(errors({ name: 'a'.repeat(64) })).to.deep.equal({});
    expect(errors({ name: 'a'.repeat(65) })).to.deep.equal({ name: 'Name must be 64 characters or fewer.' });
  });

  it('party', function () {
    expect(errors({ party: '' })).to.deep.equal({ party: 'Enter the party.' });
    expect(errors({ party: 'p'.repeat(64) })).to.deep.equal({});
    expect(errors({ party: 'p'.repeat(65) })).to.deep.equal({ party: 'Party must be 64 characters or fewer.' });
  });

  it('age', function () {
    var msg = { age: 'Age must be a whole number from 18 to 120.' };
    expect(errors({ age: '17' })).to.deep.equal(msg);
    expect(errors({ age: '18' })).to.deep.equal({});
    expect(errors({ age: '120' })).to.deep.equal({});
    expect(errors({ age: '121' })).to.deep.equal(msg);
    expect(errors({ age: '20.5' })).to.deep.equal(msg);
    expect(errors({ age: 'abc' })).to.deep.equal(msg);
    expect(errors({ age: '' })).to.deep.equal(msg);
  });

  it('qualification', function () {
    expect(errors({ qualification: '' })).to.deep.equal({ qualification: 'Enter the qualification.' });
    expect(errors({ qualification: 'q'.repeat(100) })).to.deep.equal({});
    expect(errors({ qualification: 'q'.repeat(101) })).to.deep.equal({ qualification: 'Qualification must be 100 characters or fewer.' });
  });

  it('trims before checking', function () {
    expect(errors({ name: '   ' })).to.deep.equal({ name: 'Enter the candidate\'s name.' });
    expect(errors({ age: ' 30 ' })).to.deep.equal({});
  });

  it('reports every bad field at once', function () {
    expect(Object.keys(CandidateForm.validate({ name: '', party: '', age: '', qualification: '' })))
      .to.deep.equal(['name', 'party', 'age', 'qualification']);
  });
});
